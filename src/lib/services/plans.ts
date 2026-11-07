import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertTeacherHost, AuthzError, canHostUseContent } from "../authz";
import { isSkillId, skillInfo } from "../content/taxonomy";
import type { Db } from "../db/types";
import { DEFAULT_EVIDENCE_RULE, validateRule } from "../progress";
import type { EvidenceRule, Host, LearningPlan, ObjectiveStatus } from "../types";
import {
  AI_IMPORT_SCHEMA,
  importPrompts,
  MAX_IMPORT_BYTES,
  ruleBasedParse,
  sanitizeImport,
  validateAiImport,
  type DraftPlan,
} from "../analysis/planImport";
import { ServiceError } from "./errors";
import type { InsightCaller } from "./host";
import { authorizedLearnerIds, computeRoadmap, learnerScopedAttempts, loadPlanVersion } from "./planCore";
import { generateRoomCode } from "./roomCode";

export const PlanMetaInput = z.object({
  title: z.string().trim().min(1, "Add a title.").max(100),
  subject: z.enum(["reading", "math", "mixed"]),
  courseLabel: z.string().trim().max(80).default(""),
  description: z.string().trim().max(800).default(""),
  unitLabel: z.enum(["Lecture", "Lesson"]).default("Lecture"),
});

export const StructureInput = z.object({
  lectures: z
    .array(
      z.object({
        number: z.number().int().min(0).max(500),
        title: z.string().trim().min(1, "Every lecture needs a title.").max(120),
        objectives: z
          .array(
            z.object({
              key: z.string().max(80).optional(),
              text: z.string().trim().min(3, "Objectives can't be empty.").max(300),
              skill: z.string().nullable().default(null),
              required: z.boolean().default(true),
              needsReview: z.boolean().default(false),
              reviewNote: z.string().max(400).nullable().default(null),
              sourceQuote: z.string().max(2000).nullable().default(null),
              questionIds: z.array(z.string().min(1)).max(40).default([]),
            }),
          )
          .max(30),
      }),
    )
    .max(60),
});

export const RuleInput = z.object({
  minDistinctQuestions: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  minCorrectInRecent: z.number().int(),
  requireLatestCorrect: z.boolean(),
  requireTransferCorrect: z.boolean(),
});

export const OverrideInput = z.object({
  objectiveId: z.string().min(1),
  learnerId: z.string().min(1),
  status: z.enum(["not_assessed", "in_progress", "needs_practice", "demonstrated"]),
  reason: z.string().trim().min(5, "Add a short reason (at least 5 characters).").max(500),
});

function requireHost(host: Host | null): Host {
  return assertTeacherHost(host);
}

export async function ownedPlan(db: Db, host: Host | null, id: string): Promise<LearningPlan> {
  const h = requireHost(host);
  const [plan] = await db.select("learning_plans", { eq: { id } });
  if (!plan || plan.ownerId !== h.id) throw new AuthzError(404, "Learning plan not found.");
  return plan;
}

export async function listPlans(db: Db, host: Host | null) {
  const h = requireHost(host);
  const plans = await db.select("learning_plans", { eq: { ownerId: h.id }, orderBy: { column: "updatedAt", ascending: false } });
  const assignments = plans.length ? await db.select("learning_plan_assignments", { in: { column: "planId", values: plans.map((p) => p.id) } }) : [];
  return plans.map((p) => ({ ...p, assignedCount: assignments.filter((a) => a.planId === p.id).length }));
}

export async function createPlan(db: Db, host: Host | null, meta: z.infer<typeof PlanMetaInput>, source: LearningPlan["source"] = "manual") {
  const h = requireHost(host);
  const now = new Date().toISOString();
  return db.insert("learning_plans", {
    id: randomUUID(),
    ownerId: h.id,
    ...meta,
    status: "draft",
    publishedVersion: null,
    draftVersion: 1,
    evidenceRule: DEFAULT_EVIDENCE_RULE,
    source,
    practiceCompetitionId: null,
    isDemoData: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getPlanForHost(db: Db, host: Host | null, id: string) {
  const plan = await ownedPlan(db, host, id);
  const editingVersion = plan.draftVersion ?? plan.publishedVersion!;
  const data = await loadPlanVersion(db, id, editingVersion);
  const assignments = await db.select("learning_plan_assignments", { eq: { planId: id } });
  return {
    plan,
    editing: plan.draftVersion !== null,
    version: editingVersion,
    lectures: data.lectures.map((l) => ({
      id: l.id,
      number: l.number,
      title: l.title,
      objectives: data.objectives
        .filter((o) => o.lectureId === l.id)
        .map((o) => ({
          id: o.id,
          key: o.objectiveKey,
          text: o.text,
          skill: o.skill,
          required: o.required,
          needsReview: o.needsReview,
          reviewNote: o.reviewNote,
          sourceQuote: o.sourceQuote,
          questionIds: data.mappings.filter((m) => m.objectiveId === o.id).map((m) => m.questionId),
        })),
    })),
    assignedCompetitionIds: assignments.map((a) => a.competitionId),
  };
}

export async function updatePlanMeta(db: Db, host: Host | null, id: string, meta: z.infer<typeof PlanMetaInput>) {
  await ownedPlan(db, host, id);
  const [p] = await db.update("learning_plans", { id }, { ...meta, updatedAt: new Date().toISOString() });
  return p;
}

export async function updateRule(db: Db, host: Host | null, id: string, rule: EvidenceRule) {
  await ownedPlan(db, host, id);
  const err = validateRule(rule);
  if (err) throw new ServiceError(400, "invalid_rule", err);
  const [p] = await db.update("learning_plans", { id }, { evidenceRule: rule, updatedAt: new Date().toISOString() });
  return p;
}

/** Replaces the DRAFT version's lectures/objectives/mappings. Published versions are never edited in place. */
export async function saveStructure(db: Db, host: Host | null, id: string, input: z.infer<typeof StructureInput>) {
  const plan = await ownedPlan(db, host, id);
  const h = requireHost(host);
  if (plan.draftVersion === null) throw new ServiceError(409, "no_draft", "Start a revision before editing a published plan.");
  const version = plan.draftVersion;

  const errors: string[] = [];
  const allQ = [...new Set(input.lectures.flatMap((l) => l.objectives.flatMap((o) => o.questionIds)))];
  const questions = allQ.length ? await db.select("questions", { in: { column: "id", values: allQ } }) : [];
  for (const qid of allQ) {
    const q = questions.find((x) => x.id === qid);
    if (!q || !canHostUseContent(h.id, q)) errors.push(`Question ${qid} is not available.`);
    else if (!q.verified) errors.push(`“${q.prompt.slice(0, 40)}…” is not verified, so it can't be mapped.`);
    else if (plan.subject !== "mixed" && q.subject !== plan.subject) errors.push(`“${q.prompt.slice(0, 40)}…” is a ${q.subject} question.`);
  }
  for (const l of input.lectures)
    for (const o of l.objectives) {
      if (o.skill && (!isSkillId(o.skill) || (plan.subject !== "mixed" && skillInfo(o.skill).subject !== plan.subject)))
        errors.push(`“${o.text.slice(0, 40)}…” has a skill from another subject.`);
    }
  if (errors.length) throw new ServiceError(400, "invalid_structure", [...new Set(errors)].join(" "));

  const knownKeys = new Set((await db.select("learning_objectives", { eq: { planId: id } })).map((o) => o.objectiveKey));
  await db.delete("objective_question_mappings", { planId: id, planVersion: version });
  await db.delete("learning_objectives", { planId: id, planVersion: version });
  await db.delete("learning_plan_lectures", { planId: id, planVersion: version });

  let lp = 0;
  for (const l of input.lectures) {
    const lecture = await db.insert("learning_plan_lectures", { id: randomUUID(), planId: id, planVersion: version, position: lp++, number: l.number, title: l.title });
    let op = 0;
    for (const o of l.objectives) {
      const objective = await db.insert("learning_objectives", {
        id: randomUUID(),
        planId: id,
        planVersion: version,
        lectureId: lecture.id,
        objectiveKey: o.key && knownKeys.has(o.key) ? o.key : randomUUID(),
        position: op++,
        text: o.text,
        skill: o.skill && isSkillId(o.skill) ? o.skill : null,
        required: o.required,
        needsReview: o.needsReview,
        reviewNote: o.needsReview ? o.reviewNote : null,
        sourceQuote: o.sourceQuote,
      });
      for (const qid of [...new Set(o.questionIds)])
        await db.insert("objective_question_mappings", { id: randomUUID(), objectiveId: objective.id, planId: id, planVersion: version, questionId: qid });
    }
  }
  await db.update("learning_plans", { id }, { updatedAt: new Date().toISOString() });
  return getPlanForHost(db, host, id);
}

/** Copies the published version into a new draft version (objective keys preserved). */
export async function startRevision(db: Db, host: Host | null, id: string) {
  const plan = await ownedPlan(db, host, id);
  if (plan.draftVersion !== null) return getPlanForHost(db, host, id);
  const from = plan.publishedVersion!;
  const to = from + 1;
  const data = await loadPlanVersion(db, id, from);
  const lectureMap = new Map<string, string>();
  for (const l of data.lectures) {
    const n = await db.insert("learning_plan_lectures", { ...l, id: randomUUID(), planVersion: to });
    lectureMap.set(l.id, n.id);
  }
  for (const o of data.objectives) {
    const n = await db.insert("learning_objectives", { ...o, id: randomUUID(), planVersion: to, lectureId: lectureMap.get(o.lectureId)! });
    for (const m of data.mappings.filter((x) => x.objectiveId === o.id))
      await db.insert("objective_question_mappings", { ...m, id: randomUUID(), objectiveId: n.id, planVersion: to });
  }
  await db.update("learning_plans", { id }, { draftVersion: to, updatedAt: new Date().toISOString() });
  return getPlanForHost(db, host, id);
}

export async function discardRevision(db: Db, host: Host | null, id: string) {
  const plan = await ownedPlan(db, host, id);
  if (plan.draftVersion === null || plan.publishedVersion === null) throw new ServiceError(409, "nothing_to_discard", "There is no revision to discard.");
  const v = plan.draftVersion;
  await db.delete("objective_question_mappings", { planId: id, planVersion: v });
  await db.delete("learning_objectives", { planId: id, planVersion: v });
  await db.delete("learning_plan_lectures", { planId: id, planVersion: v });
  await db.update("learning_plans", { id }, { draftVersion: null, updatedAt: new Date().toISOString() });
  return getPlanForHost(db, host, id);
}

export async function publishPlan(db: Db, host: Host | null, id: string) {
  const plan = await ownedPlan(db, host, id);
  if (plan.draftVersion === null) throw new ServiceError(409, "nothing_to_publish", "There are no draft changes to publish.");
  const data = await loadPlanVersion(db, id, plan.draftVersion);
  const problems: string[] = [];
  if (!data.lectures.length) problems.push(`Add at least one ${plan.unitLabel.toLowerCase()}.`);
  for (const l of data.lectures) if (!data.objectives.some((o) => o.lectureId === l.id)) problems.push(`“${l.title}” has no objectives.`);
  const flagged = data.objectives.filter((o) => o.needsReview);
  if (flagged.length) problems.push(`Resolve ${flagged.length} flagged objective(s) before publishing.`);
  if (problems.length) throw new ServiceError(400, "not_ready", problems.join(" "));

  let practiceCompetitionId = plan.practiceCompetitionId;
  if (!practiceCompetitionId) {
    const now = new Date().toISOString();
    const comp = await db.insert("competitions", {
      id: randomUUID(),
      ownerId: plan.ownerId,
      title: `Roadmap practice: ${plan.title}`,
      description: "Hidden practice space for learning-plan rematches.",
      subject: plan.subject === "math" ? "math" : "reading",
      gradeLevel: 5,
      status: "open",
      roomCode: generateRoomCode(),
      questionIds: [],
      isDemoData: plan.isDemoData,
      isPracticeSpace: true,
      createdAt: now,
      openedAt: now,
      closedAt: null,
    });
    practiceCompetitionId = comp.id;
  }
  const [p] = await db.update(
    "learning_plans",
    { id },
    { status: "published", publishedVersion: plan.draftVersion, draftVersion: null, practiceCompetitionId, updatedAt: new Date().toISOString() },
  );
  return p;
}

export async function assignPlan(db: Db, host: Host | null, id: string, competitionIds: string[]) {
  const plan = await ownedPlan(db, host, id);
  const ids = [...new Set(competitionIds)];
  const comps = ids.length ? await db.select("competitions", { in: { column: "id", values: ids } }) : [];
  for (const cid of ids) {
    const c = comps.find((x) => x.id === cid);
    if (!c || c.ownerId !== plan.ownerId || c.isPracticeSpace) throw new ServiceError(400, "invalid_competition", "You can only assign plans to your own classrooms.");
  }
  await db.delete("learning_plan_assignments", { planId: id });
  for (const cid of ids) await db.insert("learning_plan_assignments", { id: randomUUID(), planId: id, competitionId: cid, createdAt: new Date().toISOString() });
  return { assignedCompetitionIds: ids };
}

/** Import: creates a DRAFT plan from .txt/.md text. Nothing is published until the teacher approves. */
export async function importPlan(
  db: Db,
  host: Host | null,
  input: { filename: string; text: string; meta: z.infer<typeof PlanMetaInput> },
  ai: { call: InsightCaller; model: string } | null,
) {
  requireHost(host);
  if (!/\.(txt|md|markdown)$/i.test(input.filename)) throw new ServiceError(400, "file_type", "Import supports .txt and .md files for now. PDF import isn't available yet.");
  if (Buffer.byteLength(input.text, "utf8") > MAX_IMPORT_BYTES) throw new ServiceError(413, "too_large", "That file is larger than 100 KB.");
  const text = sanitizeImport(input.text);
  if (!text.trim()) throw new ServiceError(400, "empty", "That file is empty.");

  let draft: DraftPlan;
  if (ai) {
    const p = importPrompts(text, input.meta.subject, input.meta.unitLabel);
    const res = await ai.call({ system: p.system, user: p.user, schema: AI_IMPORT_SCHEMA });
    const v = res.ok ? validateAiImport(res.json, text, input.meta.subject) : res;
    draft = v.ok ? v.value : { ...ruleBasedParse(text, input.meta.subject), errorCode: v.errorCode };
  } else draft = ruleBasedParse(text, input.meta.subject);

  const plan = await createPlan(db, host, input.meta, "import");
  await saveStructure(db, host, plan.id, {
    lectures: draft.lectures.map((l) => ({
      number: l.number,
      title: l.title,
      objectives: l.objectives.map((o) => ({
        text: o.text,
        skill: o.skill,
        required: true,
        needsReview: o.needsReview || l.needsReview,
        reviewNote: o.reviewNote ?? (l.needsReview ? `Check this ${input.meta.unitLabel.toLowerCase()}'s number or placement.` : null),
        sourceQuote: o.sourceQuote,
        questionIds: [],
      })),
    })),
  });
  return { planId: plan.id, extraction: draft.source, errorCode: draft.errorCode ?? null, warnings: draft.warnings };
}

async function roadmapForLearner(db: Db, plan: LearningPlan, learnerId: string) {
  const data = await loadPlanVersion(db, plan.id, plan.publishedVersion!);
  const qIds = [...new Set(data.mappings.map((m) => m.questionId))];
  const questions = new Map((qIds.length ? await db.select("questions", { in: { column: "id", values: qIds } }) : []).map((q) => [q.id, q]));
  const { attempts, analyses } = await learnerScopedAttempts(db, plan, learnerId);
  const overrides = await db.select("objective_progress_overrides", { eq: { planId: plan.id, learnerId } });
  const practice = await db.select("practice_resources", {});
  return { data, questions, attempts, analyses, overrides, roadmap: computeRoadmap(plan, data, questions, attempts, analyses, overrides, practice) };
}
export { roadmapForLearner };

export async function classProgress(db: Db, host: Host | null, id: string) {
  const plan = await ownedPlan(db, host, id);
  if (plan.publishedVersion === null) throw new ServiceError(409, "not_published", "Publish the plan to see learner progress.");
  const learnerIds = await authorizedLearnerIds(db, id);
  const learners = learnerIds.length ? await db.select("learners", { in: { column: "id", values: learnerIds } }) : [];
  const rows = [];
  for (const l of learners) {
    const { roadmap } = await roadmapForLearner(db, plan, l.id);
    rows.push({
      learnerId: l.id,
      nickname: l.nickname,
      synthetic: l.isSynthetic,
      overall: roadmap.overall,
      statuses: Object.fromEntries(roadmap.lectures.flatMap((lec) => lec.objectives.map((o) => [o.id, { status: o.progress.status, overridden: Boolean(o.progress.override) }]))),
    });
  }
  const data = await loadPlanVersion(db, id, plan.publishedVersion);
  return {
    plan,
    lectures: data.lectures.map((l) => ({ id: l.id, number: l.number, title: l.title, objectives: data.objectives.filter((o) => o.lectureId === l.id).map((o) => ({ id: o.id, text: o.text })) })),
    learners: rows.sort((a, b) => a.nickname.localeCompare(b.nickname)),
  };
}

export async function learnerDetailForHost(db: Db, host: Host | null, id: string, learnerId: string) {
  const plan = await ownedPlan(db, host, id);
  if (plan.publishedVersion === null) throw new ServiceError(409, "not_published", "Publish the plan first.");
  if (!(await authorizedLearnerIds(db, id)).includes(learnerId)) throw new AuthzError(404, "Learner not found for this plan.");
  const [learner] = await db.select("learners", { eq: { id: learnerId } });
  const { roadmap: raw, questions } = await roadmapForLearner(db, plan, learnerId);
  const roadmap = {
    ...raw,
    lectures: raw.lectures.map((l) => ({
      ...l,
      objectives: l.objectives.map((o) => ({
        ...o,
        progress: { ...o.progress, evidence: o.progress.evidence.map((e) => ({ ...e, question: questions.get(e.questionId)?.prompt ?? "" })) },
      })),
    })),
  };
  const overrides = await db.select("objective_progress_overrides", { eq: { planId: id, learnerId }, orderBy: { column: "createdAt", ascending: false } });
  return { plan, learner: { id: learner.id, nickname: learner.nickname, synthetic: learner.isSynthetic }, roadmap, overrideHistory: overrides };
}

/** Teacher override: requires a reason; stores the computed status alongside it; never alters evidence. */
export async function overrideObjective(db: Db, host: Host | null, id: string, input: z.infer<typeof OverrideInput>) {
  const h = requireHost(host);
  const plan = await ownedPlan(db, host, id);
  if (plan.publishedVersion === null) throw new ServiceError(409, "not_published", "Publish the plan first.");
  if (!(await authorizedLearnerIds(db, id)).includes(input.learnerId)) throw new AuthzError(404, "Learner not found for this plan.");
  const [objective] = await db.select("learning_objectives", { eq: { id: input.objectiveId, planId: id, planVersion: plan.publishedVersion } });
  if (!objective) throw new ServiceError(400, "invalid_objective", "That objective isn't in the published plan.");
  const { roadmap } = await roadmapForLearner(db, plan, input.learnerId);
  const computed: ObjectiveStatus =
    roadmap.lectures.flatMap((l) => l.objectives).find((o) => o.id === input.objectiveId)?.progress.computedStatus ?? "not_assessed";
  return db.insert("objective_progress_overrides", {
    id: randomUUID(),
    planId: id,
    objectiveId: input.objectiveId,
    learnerId: input.learnerId,
    hostId: h.id,
    status: input.status,
    reason: input.reason,
    computedStatusAtOverride: computed,
    createdAt: new Date().toISOString(),
  });
}
