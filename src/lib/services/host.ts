import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertHostOwnsCompetition, AuthzError, canHostUseContent } from "../authz";
import { computeCompetitionAnalytics, latestAnalysisByAttempt, effectiveClassification } from "../analytics";
import { isCategoryForSubject, isSkillId, skillInfo, SKILLS, SUBJECT_MISCONCEPTIONS } from "../content/taxonomy";
import { INTERVENTIONS } from "../content/seed";
import type { Db } from "../db/types";
import { UniqueViolationError } from "../db/types";
import { recommendNextSprint } from "../recommend";
import type { Analysis, Attempt, Category, ClassificationOverride, Competition, Host, InsightPayload, Participant, Passage, Question, Subject } from "../types";
import { buildDemoBundle } from "./demoData";
import { ServiceError } from "./errors";
import {
  allowedPercentages,
  INSIGHT_PROMPT_VERSION,
  AI_INSIGHT_JSON_SCHEMA,
  insightPrompts,
  ruleBasedInsight,
  validateAiInsight,
} from "./insights";
import { generateRoomCode } from "./roomCode";

const SubjectEnum = z.enum(["reading", "math"]);

export const CompetitionInput = z.object({
  title: z.string().trim().min(1, "Add a title.").max(80),
  description: z.string().trim().max(400).default(""),
  subject: SubjectEnum,
  gradeLevel: z.number().int().min(1).max(12).default(5),
  questionIds: z.array(z.string().min(1)).max(10).default([]),
});

export const PassageInput = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(20, "Passages should be at least a sentence or two.").max(2000),
  gradeLevel: z.number().int().min(1).max(12).default(5),
});

export const QuestionInput = z.object({
  subject: SubjectEnum,
  gradeLevel: z.number().int().min(1).max(12).default(5),
  skill: z.string(),
  skillFocus: z.string().trim().max(120).default(""),
  questionRole: z.enum(["initial", "follow-up"]),
  passageId: z.string().nullable().default(null),
  prompt: z.string().trim().min(5).max(600),
  reasoningPrompt: z.string().trim().min(5).max(200),
  answerChoices: z
    .array(z.object({ id: z.string().regex(/^[A-F]$/), text: z.string().trim().min(1).max(200) }))
    .min(2)
    .max(6),
  correctAnswer: z.string().regex(/^[A-F]$/),
  referenceExplanation: z.string().trim().min(10).max(1000),
  allowedMisconceptions: z.array(z.string()).default([]),
  practiceResourceId: z.string().nullable().default(null),
  followUpQuestionId: z.string().nullable().default(null),
  verified: z.boolean().default(false),
});

export const OverrideInput = z.object({
  category: z.string(),
  note: z.string().trim().max(500).default(""),
});

async function ownedCompetition(db: Db, host: Host | null, id: string): Promise<Competition> {
  const [c] = await db.select("competitions", { eq: { id } });
  return assertHostOwnsCompetition(host?.id ?? null, c ?? null);
}

function requireHost(host: Host | null): Host {
  if (!host) throw new AuthzError(401, "Sign in as a host to continue.");
  return host;
}

export async function listCompetitions(db: Db, hostIn: Host | null) {
  const host = requireHost(hostIn);
  const comps = (await db.select("competitions", { eq: { ownerId: host.id }, orderBy: { column: "createdAt", ascending: false } })).filter(
    (c) => !c.isPracticeSpace,
  );
  const participants = comps.length
    ? await db.select("participants", { in: { column: "competitionId", values: comps.map((c) => c.id) } })
    : [];
  return comps.map((c) => ({ ...c, participantCount: participants.filter((p) => p.competitionId === c.id).length }));
}

/** Library (seed) content plus the host's own content only. */
export async function getBank(db: Db, hostIn: Host | null, subject?: Subject) {
  const host = requireHost(hostIn);
  const [questions, passages, practice] = await Promise.all([
    db.select("questions", subject ? { eq: { subject } } : {}),
    db.select("passages", subject ? { eq: { subject } } : {}),
    db.select("practice_resources", subject ? { eq: { subject } } : {}),
  ]);
  return {
    questions: questions.filter((q) => canHostUseContent(host.id, q)),
    passages: passages.filter((p) => canHostUseContent(host.id, p)),
    practice: practice.map((p) => ({ id: p.id, title: p.title, skill: p.skill, kind: p.kind, misconception: p.misconception, verified: p.verified })),
    skills: SKILLS,
  };
}

async function validateQuestionIds(db: Db, host: Host, subject: Subject, ids: string[], requireVerified: boolean) {
  if (new Set(ids).size !== ids.length) throw new ServiceError(400, "duplicate_question", "A question appears twice.");
  if (!ids.length) return;
  const qs = await db.select("questions", { in: { column: "id", values: ids } });
  for (const id of ids) {
    const q = qs.find((x) => x.id === id);
    if (!q || !canHostUseContent(host.id, q)) throw new ServiceError(400, "question_unavailable", `Question ${id} is not available.`);
    if (q.subject !== subject) throw new ServiceError(400, "subject_mismatch", "All questions must match the competition subject.");
    if (q.questionRole !== "initial")
      throw new ServiceError(400, "follow_up_in_sprint", "Follow-up questions are used for comebacks and can't be added directly.");
    if (requireVerified && !q.verified)
      throw new ServiceError(400, "unverified_question", `"${q.prompt.slice(0, 40)}…" needs a verified answer key before launch.`);
  }
}

export async function createCompetition(db: Db, hostIn: Host | null, input: z.infer<typeof CompetitionInput>) {
  const host = requireHost(hostIn);
  await validateQuestionIds(db, host, input.subject, input.questionIds, false);
  for (let i = 0; i < 5; i++) {
    try {
      return await db.insert("competitions", {
        id: randomUUID(),
        ownerId: host.id,
        ...input,
        status: "draft",
        roomCode: generateRoomCode(),
        isDemoData: false,
        isPracticeSpace: false,
        createdAt: new Date().toISOString(),
        openedAt: null,
        closedAt: null,
      });
    } catch (e) {
      if (!(e instanceof UniqueViolationError)) throw e;
    }
  }
  throw new ServiceError(500, "room_code", "Could not create a room code. Please try again.");
}

export async function getCompetitionForHost(db: Db, host: Host | null, id: string) {
  return ownedCompetition(db, host, id);
}

export async function updateCompetition(db: Db, hostIn: Host | null, id: string, input: z.infer<typeof CompetitionInput>) {
  const host = requireHost(hostIn);
  const c = await ownedCompetition(db, host, id);
  const questionsChanged = JSON.stringify(c.questionIds) !== JSON.stringify(input.questionIds) || c.subject !== input.subject;
  if (questionsChanged && c.status !== "draft")
    throw new ServiceError(409, "not_draft", "Questions and subject can only change while the competition is a draft.");
  await validateQuestionIds(db, host, input.subject, input.questionIds, false);
  const [u] = await db.update("competitions", { id, ownerId: host.id }, input);
  return u;
}

export async function setCompetitionStatus(db: Db, hostIn: Host | null, id: string, status: Competition["status"]) {
  const host = requireHost(hostIn);
  const c = await ownedCompetition(db, host, id);
  if (status === "open") {
    if (!c.questionIds.length) throw new ServiceError(400, "no_questions", "Add at least one question before launching.");
    await validateQuestionIds(db, host, c.subject, c.questionIds, true);
  }
  if (status === "draft" && c.status !== "draft") throw new ServiceError(409, "invalid_transition", "A launched competition can't return to draft.");
  const now = new Date().toISOString();
  const [u] = await db.update(
    "competitions",
    { id, ownerId: host.id },
    { status, ...(status === "open" ? { openedAt: c.openedAt ?? now, closedAt: null } : {}), ...(status === "closed" ? { closedAt: now } : {}) },
  );
  return u;
}

export async function createPassage(db: Db, hostIn: Host | null, subject: Subject, input: z.infer<typeof PassageInput>): Promise<Passage> {
  const host = requireHost(hostIn);
  if (subject !== "reading") throw new ServiceError(400, "passage_subject", "Passages are used for reading questions.");
  return db.insert("passages", {
    id: `p-${randomUUID()}`,
    subject,
    gradeLevel: input.gradeLevel,
    title: input.title,
    body: input.body,
    ownerId: host.id,
    source: "manual",
    createdAt: new Date().toISOString(),
  });
}

/** Manual question creation with quality checks (see README: Question quality). */
export async function createQuestion(db: Db, hostIn: Host | null, input: z.infer<typeof QuestionInput>): Promise<Question> {
  const host = requireHost(hostIn);
  const errors: string[] = [];
  if (!isSkillId(input.skill) || skillInfo(input.skill).subject !== input.subject) errors.push("Choose a skill that matches the subject.");
  const ids = input.answerChoices.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push("Answer choice letters must be unique.");
  if (new Set(input.answerChoices.map((c) => c.text.toLowerCase())).size !== ids.length) errors.push("Answer choices must be different from each other.");
  if (!ids.includes(input.correctAnswer)) errors.push("The correct answer must be one of the choices.");
  if (input.subject === "reading" && !input.passageId) errors.push("Reading questions need a passage.");
  if (input.subject === "math" && input.passageId) errors.push("Math questions don't use passages.");
  const allowedCodes = SUBJECT_MISCONCEPTIONS[input.subject] as string[];
  if (input.allowedMisconceptions.some((m) => !allowedCodes.includes(m))) errors.push("Misconceptions must belong to the subject's taxonomy.");
  if (input.questionRole === "follow-up" && input.followUpQuestionId) errors.push("Follow-up questions can't link to another follow-up.");

  if (input.passageId) {
    const [p] = await db.select("passages", { eq: { id: input.passageId } });
    if (!p || !canHostUseContent(host.id, p)) errors.push("Passage not found.");
  }
  if (input.practiceResourceId) {
    const [p] = await db.select("practice_resources", { eq: { id: input.practiceResourceId } });
    if (!p || p.skill !== input.skill) errors.push("Practice resource must exist and match the skill.");
  }
  if (input.followUpQuestionId) {
    const [f] = await db.select("questions", { eq: { id: input.followUpQuestionId } });
    if (!f || !canHostUseContent(host.id, f)) errors.push("Follow-up question not found.");
    else if (f.skill !== input.skill || f.questionRole !== "follow-up") errors.push("Follow-up must be a follow-up question for the same skill.");
  }
  if (errors.length) throw new ServiceError(400, "invalid_question", errors.join(" "));

  return db.insert("questions", {
    id: `q-${randomUUID()}`,
    version: 1,
    subject: input.subject,
    gradeLevel: input.gradeLevel,
    skill: input.skill as Question["skill"],
    skillFocus: input.skillFocus || skillInfo(input.skill as Question["skill"]).label,
    questionRole: input.questionRole,
    passageId: input.passageId,
    prompt: input.prompt,
    reasoningPrompt: input.reasoningPrompt,
    answerChoices: input.answerChoices,
    correctAnswer: input.correctAnswer,
    referenceExplanation: input.referenceExplanation,
    allowedMisconceptions: input.allowedMisconceptions as Question["allowedMisconceptions"],
    practiceResourceId: input.practiceResourceId,
    followUpQuestionId: input.followUpQuestionId,
    verified: input.verified,
    ownerId: host.id,
    source: "manual",
    createdAt: new Date().toISOString(),
  });
}

export async function loadCompetitionData(db: Db, competition: Competition) {
  const participants = await db.select("participants", { eq: { competitionId: competition.id } });
  const attempts = await db.select("attempts", { eq: { competitionId: competition.id } });
  const ids = attempts.map((a) => a.id);
  const [analyses, overrides] = ids.length
    ? await Promise.all([
        db.select("analyses", { in: { column: "attemptId", values: ids } }),
        db.select("classification_overrides", { in: { column: "attemptId", values: ids } }),
      ])
    : [[], []];
  const qIds = [...new Set([...competition.questionIds, ...attempts.map((a) => a.questionId)])];
  const questions = qIds.length ? await db.select("questions", { in: { column: "id", values: qIds } }) : [];
  return { participants, attempts, analyses, overrides, questions };
}

export async function getHostResults(db: Db, hostIn: Host | null, id: string) {
  const host = requireHost(hostIn);
  const competition = await ownedCompetition(db, host, id);
  const data = await loadCompetitionData(db, competition);
  const analytics = computeCompetitionAnalytics({ competition, ...data });
  const latest = latestAnalysisByAttempt(data.analyses);
  const nick = new Map(data.participants.map((p) => [p.id, p]));
  const qById = new Map(data.questions.map((q) => [q.id, q]));
  const responses = data.attempts
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((a) => {
      const la = latest.get(a.id);
      const eff = effectiveClassification(a.id, la, data.overrides);
      return {
        attemptId: a.id,
        nickname: nick.get(a.participantId)?.nickname ?? "Participant",
        synthetic: a.isSynthetic,
        kind: a.kind,
        questionId: a.questionId,
        prompt: qById.get(a.questionId)?.prompt ?? "",
        skill: a.skill,
        selectedAnswer: a.selectedAnswer,
        isCorrect: a.isCorrect,
        points: a.points,
        reasoning: a.reasoning,
        reasoningStatus: a.reasoningStatus,
        clarificationStatus: a.clarificationStatus,
        clarificationText: a.clarificationText,
        readAloudUsed: a.readAloudUsed,
        route: a.route,
        teacherReview: a.teacherReview,
        // Synthetic demo rows are presented simply as demo data; the stored record keeps its true provider.
        analysis: la
          ? {
              status: la.status,
              provider: la.isSynthetic ? null : la.provider,
              model: la.isSynthetic ? null : la.model,
              promptVersion: la.isSynthetic ? null : la.promptVersion,
              category: la.category,
              evidenceQuote: la.evidenceQuote,
              explanation: la.isSynthetic ? "Demonstration classification for a fictional student." : la.explanation,
              errorCode: la.errorCode,
              synthetic: la.isSynthetic,
            }
          : null,
        effective: eff,
        createdAt: a.createdAt,
      };
    });
  const [insight] = await db.select("insights", { eq: { competitionId: id }, orderBy: { column: "createdAt", ascending: false }, limit: 1 });
  const assignments = await db.select("intervention_assignments", { eq: { competitionId: id } });
  return {
    competition,
    analytics,
    responses,
    questions: competition.questionIds.map((qid) => {
      const q = qById.get(qid);
      return { id: qid, prompt: q?.prompt ?? "", skill: q?.skill ?? null };
    }),
    insight: insight ?? null,
    assignments,
    interventions: INTERVENTIONS.filter((i) => i.subject === competition.subject),
    generatedAt: new Date().toISOString(),
  };
}

export async function overrideClassification(db: Db, hostIn: Host | null, attemptId: string, input: z.infer<typeof OverrideInput>) {
  const host = requireHost(hostIn);
  const [attempt] = await db.select("attempts", { eq: { id: attemptId } });
  if (!attempt) throw new AuthzError(404, "Not found.");
  const competition = await ownedCompetition(db, host, attempt.competitionId);
  if (!isCategoryForSubject(input.category, competition.subject))
    throw new ServiceError(400, "invalid_category", "Choose a category from this subject's taxonomy.");
  const latest = latestAnalysisByAttempt(await db.select("analyses", { eq: { attemptId } })).get(attemptId);
  if (!latest) throw new ServiceError(400, "no_analysis", "There is no analysis to override.");
  // Original analysis is kept; the override is a separate record.
  return db.insert("classification_overrides", {
    id: randomUUID(),
    analysisId: latest.id,
    attemptId,
    hostId: host.id,
    category: input.category as Category,
    note: input.note,
    createdAt: new Date().toISOString(),
  });
}

export type InsightCaller = (opts: { system: string; user: string; schema: Record<string, unknown> }) => Promise<
  { ok: true; json: unknown } | { ok: false; errorCode: string }
>;

export async function generateInsight(
  db: Db,
  hostIn: Host | null,
  id: string,
  ai: { call: InsightCaller; model: string } | null,
) {
  const host = requireHost(hostIn);
  const competition = await ownedCompetition(db, host, id);
  const data = await loadCompetitionData(db, competition);
  const analytics = computeCompetitionAnalytics({ competition, ...data });

  let payload: InsightPayload;
  let provider = "rule-based";
  let model: string | null = null;
  let status: "completed" | "unavailable" = "completed";
  if (!ai) {
    payload = ruleBasedInsight(competition, analytics);
  } else {
    const p = insightPrompts(competition, analytics);
    const res = await ai.call({ system: p.system, user: p.user, schema: AI_INSIGHT_JSON_SCHEMA });
    const v = res.ok
      ? validateAiInsight(res.json, new Set(p.evidence.map((e) => e.id)), new Set(p.library.map((l) => l.id)), allowedPercentages(analytics))
      : res;
    if (v.ok) {
      provider = "anthropic";
      model = ai.model;
      payload = { source: "ai", ...v.value };
    } else {
      // AI unavailable or invalid: say so, and show clearly labelled rule-based suggestions instead.
      status = "unavailable";
      provider = "anthropic";
      model = ai.model;
      payload = ruleBasedInsight(competition, analytics, v.errorCode);
    }
  }
  return db.insert("insights", {
    id: randomUUID(),
    competitionId: id,
    hostId: host.id,
    provider,
    model,
    promptVersion: provider === "anthropic" ? INSIGHT_PROMPT_VERSION : "rules-v1",
    status,
    payload,
    createdAt: new Date().toISOString(),
  });
}

export async function assignIntervention(
  db: Db,
  hostIn: Host | null,
  id: string,
  input: { interventionId: string; rationale: string; source: "ai" | "rule-based" },
) {
  const host = requireHost(hostIn);
  const competition = await ownedCompetition(db, host, id);
  const intervention = INTERVENTIONS.find((i) => i.id === input.interventionId && i.subject === competition.subject);
  if (!intervention) throw new ServiceError(400, "unknown_intervention", "Unknown activity.");
  return db.insert("intervention_assignments", {
    id: randomUUID(),
    competitionId: id,
    hostId: host.id,
    interventionId: intervention.id,
    rationale: input.rationale.slice(0, 500),
    source: input.source,
    createdAt: new Date().toISOString(),
  });
}

export async function getRecommendation(db: Db, hostIn: Host | null, subject: Subject) {
  const host = requireHost(hostIn);
  const comps = await db.select("competitions", { eq: { ownerId: host.id } });
  const history = comps.length ? await db.select("attempts", { in: { column: "competitionId", values: comps.map((c) => c.id) } }) : [];
  const bank = (await db.select("questions", { eq: { subject } })).filter((q) => canHostUseContent(host.id, q));
  return { ...recommendNextSprint(subject, history, bank), basedOnAttempts: history.filter((a) => a.kind === "initial" && a.subject === subject).length };
}

export async function loadDemoData(db: Db, hostIn: Host | null) {
  const host = requireHost(hostIn);
  const existing = await db.select("competitions", { eq: { ownerId: host.id, isDemoData: true } });
  if (existing.length) throw new ServiceError(409, "demo_exists", "Demonstration data is already loaded for your account.");
  const bundle = buildDemoBundle(host.id, new Set());
  for (const c of bundle.competitions) await db.insert("competitions", c);
  for (const p of bundle.participants) await db.insert("participants", p);
  for (const a of bundle.attempts.filter((x) => x.kind === "initial")) await db.insert("attempts", a);
  for (const a of bundle.attempts.filter((x) => x.kind === "comeback")) await db.insert("attempts", a);
  for (const a of bundle.analyses) await db.insert("analyses", a);
  return { competitions: bundle.competitions.length };
}

/** Class overview across several of the host's competitions, filtered by subject and competition. */
export async function getOverview(db: Db, hostIn: Host | null, filter: { subject: "all" | Subject; competitionIds: string[] | null }) {
  const host = requireHost(hostIn);
  const all = (await db.select("competitions", { eq: { ownerId: host.id } })).filter((c) => !c.isPracticeSpace && c.status !== "draft");
  const available = all
    .filter((c) => filter.subject === "all" || c.subject === filter.subject)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const selected = filter.competitionIds ? available.filter((c) => filter.competitionIds!.includes(c.id)) : available;
  const merged = { participants: [] as Participant[], attempts: [] as Attempt[], analyses: [] as Analysis[], overrides: [] as ClassificationOverride[], questions: [] as Question[] };
  const perCompetition = [];
  for (const c of selected) {
    const raw = await loadCompetitionData(db, c);
    // Defence in depth: the subject filter also applies to individual attempts.
    const d = filter.subject === "all" ? raw : { ...raw, attempts: raw.attempts.filter((a) => a.subject === filter.subject) };
    merged.participants.push(...d.participants);
    merged.attempts.push(...d.attempts);
    merged.analyses.push(...d.analyses);
    merged.overrides.push(...d.overrides);
    merged.questions.push(...d.questions.filter((q) => !merged.questions.some((x) => x.id === q.id)));
    const a = computeCompetitionAnalytics({ competition: c, ...d });
    perCompetition.push({
      id: c.id,
      title: c.title,
      subject: c.subject,
      status: c.status,
      isDemoData: c.isDemoData,
      participants: a.participantCount,
      completion: a.completion,
      firstTryAccuracy: a.questionAccuracy.reduce(
        (s, q) => ({ numerator: s.numerator + q.accuracy.numerator, denominator: s.denominator + q.accuracy.denominator }),
        { numerator: 0, denominator: 0 },
      ),
      comebackSuccess: a.comebackSuccess,
    });
  }
  const analytics = computeCompetitionAnalytics({ competitions: selected, ...merged });
  return {
    available: available.map((c) => ({ id: c.id, title: c.title, subject: c.subject, status: c.status, isDemoData: c.isDemoData })),
    selectedIds: selected.map((c) => c.id),
    analytics,
    perCompetition,
  };
}
