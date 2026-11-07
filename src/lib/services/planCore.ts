import { latestAnalysisByAttempt } from "../analytics";
import { isMisconceptionCode, skillInfo } from "../content/taxonomy";
import type { Db } from "../db/types";
import {
  computeObjectiveProgress,
  describeRule,
  lectureStatus,
  ruleBasedNextObjective,
  type ObjectiveProgress,
} from "../progress";
import type {
  Analysis,
  Attempt,
  LearningObjective,
  LearningPlan,
  ObjectiveOverride,
  ObjectiveQuestionMapping,
  ObjectiveStatus,
  PlanLecture,
  PracticeResource,
  Question,
} from "../types";

export interface PlanVersionData {
  version: number;
  lectures: PlanLecture[];
  objectives: LearningObjective[];
  mappings: ObjectiveQuestionMapping[];
}

export async function loadPlanVersion(db: Db, planId: string, version: number): Promise<PlanVersionData> {
  const [lectures, objectives, mappings] = await Promise.all([
    db.select("learning_plan_lectures", { eq: { planId, planVersion: version } }),
    db.select("learning_objectives", { eq: { planId, planVersion: version } }),
    db.select("objective_question_mappings", { eq: { planId, planVersion: version } }),
  ]);
  lectures.sort((a, b) => a.position - b.position);
  objectives.sort((a, b) => a.position - b.position);
  return { version, lectures, objectives, mappings };
}

/** Learner ids authorized for a plan: real learners who joined a competition the plan is assigned to. */
export async function authorizedLearnerIds(db: Db, planId: string): Promise<string[]> {
  const assignments = await db.select("learning_plan_assignments", { eq: { planId } });
  if (!assignments.length) return [];
  const participants = await db.select("participants", { in: { column: "competitionId", values: assignments.map((a) => a.competitionId) } });
  return [...new Set(participants.map((p) => p.learnerId).filter((x): x is string => Boolean(x)))];
}

/**
 * Evidence scope: the learner's attempts in competitions owned by the plan's teacher
 * (including the plan practice space). Other teachers' data is never used.
 */
export async function learnerScopedAttempts(db: Db, plan: LearningPlan, learnerId: string): Promise<{ attempts: Attempt[]; analyses: Analysis[] }> {
  const participants = await db.select("participants", { eq: { learnerId } });
  if (!participants.length) return { attempts: [], analyses: [] };
  const comps = await db.select("competitions", { in: { column: "id", values: participants.map((p) => p.competitionId) } });
  const ownCompIds = new Set(comps.filter((c) => c.ownerId === plan.ownerId).map((c) => c.id));
  const pids = participants.filter((p) => ownCompIds.has(p.competitionId)).map((p) => p.id);
  if (!pids.length) return { attempts: [], analyses: [] };
  const attempts = await db.select("attempts", { in: { column: "participantId", values: pids } });
  const analyses = attempts.length ? await db.select("analyses", { in: { column: "attemptId", values: attempts.map((a) => a.id) } }) : [];
  return { attempts, analyses };
}

export interface ObjectiveView {
  id: string;
  key: string;
  text: string;
  skill: string | null;
  skillLabel: string | null;
  required: boolean;
  progress: ObjectiveProgress;
  practiceAvailable: boolean;
}

export interface LectureView {
  id: string;
  number: number;
  title: string;
  status: ObjectiveStatus;
  demonstrated: number;
  required: number;
  lastActivity: string | null;
  objectives: ObjectiveView[];
}

export interface RoadmapView {
  planId: string;
  version: number;
  unitLabel: string;
  ruleText: string;
  overall: { demonstrated: number; total: number };
  lectures: LectureView[];
  nextStep: { objectiveId: string; practiceResourceId: string | null; reason: string } | null;
}

export function computeRoadmap(
  plan: LearningPlan,
  data: PlanVersionData,
  questions: Map<string, Question>,
  attempts: Attempt[],
  analyses: Analysis[],
  overrides: ObjectiveOverride[],
  practice: PracticeResource[],
): RoadmapView {
  const latestOverride = new Map<string, ObjectiveOverride>();
  for (const o of [...overrides].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))) latestOverride.set(o.objectiveId, o);

  let order = 0;
  const candidates: { objectiveId: string; status: ObjectiveStatus; hasPractice: boolean; order: number }[] = [];
  const lectures: LectureView[] = data.lectures.map((lec) => {
    const objectives: ObjectiveView[] = data.objectives
      .filter((o) => o.lectureId === lec.id)
      .map((o) => {
        const mapped = data.mappings.filter((m) => m.objectiveId === o.id).map((m) => m.questionId);
        const verifiedMapped = mapped.filter((qid) => questions.get(qid)?.verified);
        const progress = computeObjectiveProgress(o, mapped, attempts, plan.evidenceRule, latestOverride.get(o.id) ?? null);
        candidates.push({ objectiveId: o.id, status: progress.status, hasPractice: verifiedMapped.length > 0, order: order++ });
        return {
          id: o.id,
          key: o.objectiveKey,
          text: o.text,
          skill: o.skill,
          skillLabel: o.skill ? skillInfo(o.skill).label : null,
          required: o.required,
          progress,
          practiceAvailable: verifiedMapped.length > 0,
        };
      });
    const req = objectives.filter((o) => o.required);
    const last = objectives.map((o) => o.progress.lastActivity).filter(Boolean).sort().pop() ?? null;
    return {
      id: lec.id,
      number: lec.number,
      title: lec.title,
      status: lectureStatus(objectives.map((o) => ({ required: o.required, status: o.progress.status }))),
      demonstrated: req.filter((o) => o.progress.status === "demonstrated").length,
      required: req.length,
      lastActivity: last,
      objectives,
    };
  });

  const all = lectures.flatMap((l) => l.objectives);
  const nextId = ruleBasedNextObjective(candidates);
  let nextStep: RoadmapView["nextStep"] = null;
  if (nextId) {
    const ov = all.find((o) => o.id === nextId)!;
    nextStep = {
      objectiveId: nextId,
      practiceResourceId: practiceFor(ov, data, questions, attempts, analyses, practice),
      reason:
        ov.progress.status === "needs_practice"
          ? "This objective needs more practice based on your recent answers."
          : ov.progress.status === "in_progress"
            ? "You've started this objective — a few more questions will give enough evidence."
            : "You haven't tried this objective yet.",
    };
  }
  return {
    planId: plan.id,
    version: data.version,
    unitLabel: plan.unitLabel,
    ruleText: describeRule(plan.evidenceRule),
    overall: { demonstrated: all.filter((o) => o.required && o.progress.status === "demonstrated").length, total: all.filter((o) => o.required).length },
    lectures,
    nextStep,
  };
}

/** Verified practice for an objective: targeted if the latest relevant analysis found a supported misconception. */
export function practiceFor(
  ov: Pick<ObjectiveView, "id" | "skill">,
  data: PlanVersionData,
  questions: Map<string, Question>,
  attempts: Attempt[],
  analyses: Analysis[],
  practice: PracticeResource[],
): string | null {
  const mapped = data.mappings.filter((m) => m.objectiveId === ov.id).map((m) => m.questionId);
  const skills = new Set([ov.skill, ...mapped.map((q) => questions.get(q)?.skill)].filter(Boolean));
  const latest = latestAnalysisByAttempt(analyses);
  const relevant = attempts.filter((a) => mapped.includes(a.questionId) && !a.isCorrect).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const a of relevant) {
    const cat = latest.get(a.id)?.category;
    if (isMisconceptionCode(cat)) {
      const t = practice.find((p) => p.verified && p.kind === "targeted" && p.misconception === cat && skills.has(p.skill));
      if (t) return t.id;
    }
  }
  return practice.find((p) => p.verified && p.kind === "general" && skills.has(p.skill))?.id ?? null;
}
