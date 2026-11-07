import { randomUUID } from "node:crypto";
import { AuthzError } from "../authz";
import { categoryInfo, skillInfo } from "../content/taxonomy";
import { latestAnalysisByAttempt } from "../analytics";
import type { ReasoningAnalyzer } from "../analysis/types";
import { guidePrompts, GUIDE_JSON_SCHEMA, ruleBasedGuide, validateGuide, type GuideAsk, type GuideInput, type GuideOutput } from "../analysis/progressGuide";
import type { Db } from "../db/types";
import { nextStep } from "../routing";
import { toStudentPractice, toStudentQuestion } from "../sanitize";
import { isCorrectChoice, ScoringError } from "../scoring";
import type { Attempt, LearningPlan, Learner, Participant } from "../types";
import { analyzeAndStore } from "./analyze";
import { ServiceError } from "./errors";
import type { InsightCaller } from "./host";
import { AnswerInput, computeAndStoreRoute, exposure, studentFeedback } from "./play";
import { loadPlanVersion } from "./planCore";
import { roadmapForLearner } from "./plans";
import type { z } from "zod";

function requireLearner(learner: Learner | null): Learner {
  if (!learner) throw new AuthzError(401, "Join a sprint first to see your roadmap.");
  return learner;
}

/** Published plans assigned to any classroom (competition) this learner has joined. */
export async function assignedPlans(db: Db, learnerIn: Learner | null): Promise<LearningPlan[]> {
  const learner = requireLearner(learnerIn);
  const parts = await db.select("participants", { eq: { learnerId: learner.id } });
  if (!parts.length) return [];
  const assignments = await db.select("learning_plan_assignments", { in: { column: "competitionId", values: parts.map((p) => p.competitionId) } });
  if (!assignments.length) return [];
  const plans = await db.select("learning_plans", { in: { column: "id", values: [...new Set(assignments.map((a) => a.planId))] } });
  return plans.filter((p) => p.status === "published" && p.publishedVersion !== null);
}

async function authorizedPlan(db: Db, learner: Learner | null, planId: string): Promise<{ learner: Learner; plan: LearningPlan }> {
  const l = requireLearner(learner);
  const plan = (await assignedPlans(db, l)).find((p) => p.id === planId);
  if (!plan) throw new AuthzError(404, "Learning plan not found.");
  return { learner: l, plan };
}

export async function listRoadmaps(db: Db, learner: Learner | null) {
  const l = requireLearner(learner);
  const plans = await assignedPlans(db, l);
  const out = [];
  for (const p of plans) {
    const { roadmap } = await roadmapForLearner(db, p, l.id);
    out.push({ id: p.id, title: p.title, courseLabel: p.courseLabel, subject: p.subject, unitLabel: p.unitLabel, isDemoData: p.isDemoData, overall: roadmap.overall });
  }
  return { nickname: l.nickname, plans: out };
}

export async function getRoadmap(db: Db, learnerIn: Learner | null, planId: string) {
  const { learner, plan } = await authorizedPlan(db, learnerIn, planId);
  const { roadmap, attempts, analyses, questions, data } = await roadmapForLearner(db, plan, learner.id);
  const latest = latestAnalysisByAttempt(analyses);
  const mappedBy = new Map<string, string[]>();
  for (const m of data.mappings) mappedBy.set(m.questionId, [...(mappedBy.get(m.questionId) ?? []), m.objectiveId]);
  const allQ = new Map(questions);
  const missing = [...new Set(attempts.map((a) => a.questionId))].filter((id) => !allQ.has(id));
  if (missing.length) for (const q of await db.select("questions", { in: { column: "id", values: missing } })) allQ.set(q.id, q);

  const recent = [...attempts]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 12)
    .map((a) => {
      const an = latest.get(a.id);
      return {
        attemptId: a.id,
        kind: a.kind,
        question: allQ.get(a.questionId)?.prompt ?? "",
        isCorrect: a.isCorrect,
        points: a.points,
        independent: a.independent,
        createdAt: a.createdAt,
        objectiveIds: mappedBy.get(a.questionId) ?? [],
        likelyIdea: an?.status === "completed" && an.category && !["NO_MISCONCEPTION_DETECTED", "INSUFFICIENT_EVIDENCE"].includes(an.category) ? categoryInfo(an.category).studentLabel : null,
      };
    });

  // Evidence detail payload: question prompts for each evidence item (no answer keys).
  const lectures = roadmap.lectures.map((l) => ({
    ...l,
    objectives: l.objectives.map((o) => ({
      ...o,
      progress: { ...o.progress, evidence: o.progress.evidence.map((e) => ({ ...e, question: allQ.get(e.questionId)?.prompt ?? "" })) },
    })),
  }));
  const practiceTitle = roadmap.nextStep?.practiceResourceId
    ? (await db.select("practice_resources", { eq: { id: roadmap.nextStep.practiceResourceId } }))[0]?.title ?? null
    : null;
  return {
    plan: { id: plan.id, title: plan.title, courseLabel: plan.courseLabel, description: plan.description, unitLabel: plan.unitLabel, isDemoData: plan.isDemoData, version: roadmap.version },
    ruleText: roadmap.ruleText,
    overall: roadmap.overall,
    lectures,
    nextStep: roadmap.nextStep ? { ...roadmap.nextStep, practiceTitle } : null,
    recent,
  };
}

/** Picks a verified question mapped to the objective, preferring ones the learner hasn't seen. */
export async function objectivePractice(db: Db, learnerIn: Learner | null, planId: string, objectiveId: string) {
  const { learner, plan } = await authorizedPlan(db, learnerIn, planId);
  const data = await loadPlanVersion(db, planId, plan.publishedVersion!);
  const objective = data.objectives.find((o) => o.id === objectiveId);
  if (!objective) throw new AuthzError(404, "Objective not found.");
  const lecture = data.lectures.find((l) => l.id === objective.lectureId)!;
  const mapped = data.mappings.filter((m) => m.objectiveId === objectiveId).map((m) => m.questionId);
  const questions = (mapped.length ? await db.select("questions", { in: { column: "id", values: mapped } }) : []).filter((q) => q.verified);
  const base = { objective: { id: objective.id, text: objective.text, lecture: `${plan.unitLabel} ${lecture.number}: ${lecture.title}` }, planTitle: plan.title };
  if (!questions.length) return { ...base, question: null, repeat: false, message: "Your teacher hasn't added practice for this objective yet." };

  const parts = await db.select("participants", { eq: { learnerId: learner.id } });
  const seen = parts.length ? await db.select("attempts", { in: { column: "participantId", values: parts.map((p) => p.id) } }) : [];
  const lastSeen = new Map<string, string>();
  for (const a of seen) if (!lastSeen.has(a.questionId) || lastSeen.get(a.questionId)! < a.createdAt) lastSeen.set(a.questionId, a.createdAt);
  const sorted = [...questions].sort((a, b) => {
    const sa = lastSeen.get(a.id), sb = lastSeen.get(b.id);
    if (!sa && sb) return -1;
    if (sa && !sb) return 1;
    if (sa && sb) return sa < sb ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const q = sorted[0];
  const passage = q.passageId ? (await db.select("passages", { eq: { id: q.passageId } }))[0] ?? null : null;
  return { ...base, question: toStudentQuestion(q, passage), repeat: lastSeen.has(q.id), message: null };
}

async function ensurePracticeParticipant(db: Db, plan: LearningPlan, learner: Learner): Promise<Participant> {
  if (!plan.practiceCompetitionId) throw new ServiceError(409, "no_practice_space", "This plan isn't ready for practice yet.");
  const [p] = await db.select("participants", { eq: { competitionId: plan.practiceCompetitionId, learnerId: learner.id } });
  if (p) return p;
  return db.insert("participants", {
    id: randomUUID(),
    competitionId: plan.practiceCompetitionId,
    learnerId: learner.id,
    nickname: learner.nickname,
    isSynthetic: learner.isSynthetic,
    joinedAt: new Date().toISOString(),
  });
}

/** Records a targeted rematch answer (no competition points) through the existing analysis + routing engine. */
export async function submitRoadmapAnswer(
  db: Db,
  analyzer: ReasoningAnalyzer,
  learnerIn: Learner | null,
  planId: string,
  objectiveId: string,
  input: z.infer<typeof AnswerInput>,
) {
  const { learner, plan } = await authorizedPlan(db, learnerIn, planId);
  const data = await loadPlanVersion(db, planId, plan.publishedVersion!);
  if (!data.mappings.some((m) => m.objectiveId === objectiveId && m.questionId === input.questionId))
    throw new ServiceError(400, "not_mapped", "That question isn't mapped to this objective.");
  const [question] = await db.select("questions", { eq: { id: input.questionId } });
  if (!question?.verified) throw new ServiceError(400, "unverified", "That question isn't available.");
  let isCorrect: boolean;
  try {
    isCorrect = isCorrectChoice(question, input.selectedAnswer);
  } catch (e) {
    if (e instanceof ScoringError) throw new ServiceError(400, e.code, e.message);
    throw e;
  }
  const participant = await ensurePracticeParticipant(db, plan, learner);
  const reasoning = input.reasoningStatus === "provided" ? input.reasoning.trim() : "";
  let attempt: Attempt = await db.insert("attempts", {
    id: randomUUID(),
    participantId: participant.id,
    competitionId: participant.competitionId,
    questionId: question.id,
    questionVersion: question.version,
    subject: question.subject,
    skill: question.skill,
    kind: "roadmap",
    originalAttemptId: null,
    selectedAnswer: input.selectedAnswer,
    isCorrect,
    points: 0,
    reasoning,
    reasoningStatus: input.reasoningStatus === "provided" && !reasoning ? "skipped" : input.reasoningStatus,
    readAloudUsed: input.readAloudUsed,
    route: null,
    clarificationStatus: "none",
    clarificationText: null,
    practiceCompletedAt: null,
    teacherReview: false,
    ...(await exposure(db, participant, question.id)),
    objectiveId,
    isSynthetic: learner.isSynthetic,
    createdAt: new Date().toISOString(),
  });
  const passage = question.passageId ? (await db.select("passages", { eq: { id: question.passageId } }))[0] ?? null : null;
  let analysis = null;
  try {
    analysis = await analyzeAndStore({ db, analyzer, attempt, question, passage, stage: "initial" });
  } catch (e) {
    console.error("[roadmap] analysis failed", e);
  }
  attempt = await computeAndStoreRoute(db, attempt, question, analysis, false);
  return { attemptId: attempt.id, practiceCompetitionId: participant.competitionId, feedback: studentFeedback(question, attempt, analysis, attempt.route) };
}

/** Next step after a roadmap answer (clarify → practice → comeback → done), reusing the competition engine. */
export async function roadmapAttemptState(db: Db, learnerIn: Learner | null, planId: string, attemptId: string) {
  const { learner, plan } = await authorizedPlan(db, learnerIn, planId);
  const [attempt] = await db.select("attempts", { eq: { id: attemptId } });
  const [participant] = attempt ? await db.select("participants", { eq: { id: attempt.participantId } }) : [];
  if (!attempt || attempt.kind !== "roadmap" || participant?.learnerId !== learner.id || attempt.competitionId !== plan.practiceCompetitionId)
    throw new AuthzError(404, "Not found.");
  const comebacks = await db.select("attempts", { eq: { originalAttemptId: attempt.id } });
  const analyses = await db.select("analyses", { eq: { attemptId: attempt.id } });
  const step = nextStep([attempt.questionId], [{ ...attempt, kind: "initial" }, ...comebacks], latestAnalysisByAttempt(analyses));
  const base = { step, practiceCompetitionId: attempt.competitionId };
  if (step.type === "practice") {
    const [p] = await db.select("practice_resources", { eq: { id: step.practiceResourceId } });
    return { ...base, practice: p ? toStudentPractice(p) : null };
  }
  if (step.type === "comeback" || step.type === "clarify") {
    const [q] = await db.select("questions", { eq: { id: step.questionId } });
    const passage = q.passageId ? (await db.select("passages", { eq: { id: q.passageId } }))[0] ?? null : null;
    return { ...base, question: toStudentQuestion(q, passage), yourReasoning: attempt.reasoning };
  }
  return base;
}

export async function explainProgress(
  db: Db,
  learnerIn: Learner | null,
  planId: string,
  ask: GuideAsk,
  focus: { lectureId?: string | null; objectiveId?: string | null },
  ai: { call: InsightCaller; model: string } | null,
): Promise<GuideOutput> {
  const { learner, plan } = await authorizedPlan(db, learnerIn, planId);
  const { roadmap, attempts, analyses, data } = await roadmapForLearner(db, plan, learner.id);
  const lectureIds = new Set(roadmap.lectures.map((l) => l.id));
  const objectiveIds = new Set(roadmap.lectures.flatMap((l) => l.objectives.map((o) => o.id)));
  const focusLectureId = focus.lectureId && lectureIds.has(focus.lectureId) ? focus.lectureId : null;
  const focusObjectiveId = focus.objectiveId && objectiveIds.has(focus.objectiveId) ? focus.objectiveId : null;

  const latest = latestAnalysisByAttempt(analyses);
  const counted = new Set(roadmap.lectures.flatMap((l) => l.objectives.flatMap((o) => o.progress.evidence.filter((e) => e.counted).map((e) => e.attemptId))));
  const mappedBy = new Map<string, string[]>();
  for (const m of data.mappings) mappedBy.set(m.questionId, [...(mappedBy.get(m.questionId) ?? []), m.objectiveId]);
  const qIds = [...new Set(attempts.map((a) => a.questionId))];
  const qs = new Map((qIds.length ? await db.select("questions", { in: { column: "id", values: qIds } }) : []).map((q) => [q.id, q]));
  const guideAttempts = attempts
    .filter((a) => mappedBy.has(a.questionId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 30)
    .map((a) => {
      const an = latest.get(a.id);
      const specific = an?.status === "completed" && an.category && !["NO_MISCONCEPTION_DETECTED", "INSUFFICIENT_EVIDENCE"].includes(an.category);
      return {
        attemptId: a.id,
        objectiveIds: mappedBy.get(a.questionId)!,
        question: qs.get(a.questionId)?.prompt ?? "",
        kind: a.kind,
        correct: a.isCorrect,
        counted: counted.has(a.id),
        date: a.createdAt,
        likelyIdea: specific ? categoryInfo(an!.category!).label : null,
        quote: specific ? an!.evidenceQuote : null,
      };
    });
  const practiceAll = await db.select("practice_resources", {});
  const practice = roadmap.lectures.flatMap((l) =>
    l.objectives
      .filter((o) => o.practiceAvailable)
      .flatMap((o) => {
        const skills = new Set([o.skill, ...data.mappings.filter((m) => m.objectiveId === o.id).map((m) => qs.get(m.questionId)?.skill)].filter(Boolean));
        return practiceAll.filter((p) => p.verified && skills.has(p.skill)).map((p) => ({ practiceResourceId: p.id, title: p.title, objectiveId: o.id }));
      }),
  );
  const practiceOptions = [...new Set(practice.map((p) => p.practiceResourceId))].map((id) => ({
    practiceResourceId: id,
    title: practice.find((p) => p.practiceResourceId === id)!.title,
    objectiveIds: practice.filter((p) => p.practiceResourceId === id).map((p) => p.objectiveId),
  }));

  const input: GuideInput = { ask, focusLectureId, focusObjectiveId, roadmap, attempts: guideAttempts, practice: practiceOptions };
  if (!ai) return ruleBasedGuide(input);
  const p = guidePrompts(input);
  const res = await ai.call({ system: p.system, user: p.user, schema: GUIDE_JSON_SCHEMA });
  const v = res.ok ? validateGuide(res.json, input) : res;
  return v.ok ? v.value : ruleBasedGuide(input, v.errorCode);
}

export function skillLabel(id: string | null) {
  return id ? skillInfo(id as Parameters<typeof skillInfo>[0]).label : null;
}
