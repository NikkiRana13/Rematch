/**
 * Deterministic learning-plan progress ("Demonstrated in Rematch").
 *
 * This is an MVP progress rule, NOT a validated educational standard or mastery measure.
 * AI never assigns these statuses; it may only explain them.
 */
import type { Attempt, EvidenceRule, LearningObjective, ObjectiveOverride, ObjectiveStatus } from "./types";

export const DEFAULT_EVIDENCE_RULE: EvidenceRule = {
  minDistinctQuestions: 3,
  minCorrectInRecent: 2,
  requireLatestCorrect: true,
  requireTransferCorrect: true,
};

/** The small set of rule options a teacher may choose from. */
export const RULE_PRESETS: { id: string; label: string; rule: EvidenceRule }[] = [
  { id: "standard", label: "Standard (default): 3 questions, 2 of last 3 correct, latest correct, 1 correct rematch", rule: DEFAULT_EVIDENCE_RULE },
  {
    id: "lighter",
    label: "Lighter: 2 questions, both correct, 1 correct rematch",
    rule: { minDistinctQuestions: 2, minCorrectInRecent: 2, requireLatestCorrect: true, requireTransferCorrect: true },
  },
  {
    id: "stricter",
    label: "Stricter: 4 questions, 3 of last 4 correct, latest correct, 1 correct rematch",
    rule: { minDistinctQuestions: 4, minCorrectInRecent: 3, requireLatestCorrect: true, requireTransferCorrect: true },
  },
];

export function validateRule(r: EvidenceRule): string | null {
  if (![2, 3, 4].includes(r.minDistinctQuestions)) return "Distinct questions must be 2, 3 or 4.";
  if (!Number.isInteger(r.minCorrectInRecent) || r.minCorrectInRecent < Math.ceil(r.minDistinctQuestions / 2) || r.minCorrectInRecent > r.minDistinctQuestions)
    return "Correct answers must be at least half of, and at most, the number of recent questions.";
  if (!r.requireLatestCorrect && !r.requireTransferCorrect && r.minCorrectInRecent < r.minDistinctQuestions)
    return "Keep at least one of: latest answer correct, or a correct rematch.";
  return null;
}

export function describeRule(r: EvidenceRule): string {
  const parts = [
    `at least ${r.minDistinctQuestions} different mapped questions answered independently`,
    `at least ${r.minCorrectInRecent} correct among the most recent ${r.minDistinctQuestions}`,
  ];
  if (r.requireLatestCorrect) parts.push("the most recent one correct");
  if (r.requireTransferCorrect) parts.push("at least one correct rematch question");
  return parts.join(", ");
}

export const STATUS_LABEL: Record<ObjectiveStatus, string> = {
  not_assessed: "Not assessed",
  in_progress: "In progress",
  needs_practice: "Needs practice",
  demonstrated: "Demonstrated in Rematch",
};

/** Transfer/rematch evidence: a comeback or a targeted roadmap rematch (not a first-pass sprint question). */
export function isTransfer(a: Pick<Attempt, "kind">): boolean {
  return a.kind === "comeback" || a.kind === "roadmap";
}

export interface EvidenceItem {
  attemptId: string;
  questionId: string;
  kind: Attempt["kind"];
  isCorrect: boolean;
  independent: boolean;
  createdAt: string;
  counted: boolean;
  note: string;
}

export interface ObjectiveProgress {
  objectiveId: string;
  objectiveKey: string;
  status: ObjectiveStatus;
  computedStatus: ObjectiveStatus;
  override: { status: ObjectiveStatus; reason: string; createdAt: string } | null;
  mappedQuestionCount: number;
  distinctQuestions: number;
  recent: { questionId: string; isCorrect: boolean; createdAt: string }[];
  recentCorrect: number;
  latestCorrect: boolean | null;
  transferCorrect: number;
  supportedPractice: number;
  excludedAttempts: number;
  lastActivity: string | null;
  reasons: string[];
  evidence: EvidenceItem[];
}

const byDateAsc = (a: { createdAt: string }, b: { createdAt: string }) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

/**
 * Computes one objective's status from the learner's attempts.
 * - Only attempts on questions explicitly mapped to THIS objective count.
 * - Each question counts once (its first independent attempt); retries are never new evidence.
 * - Attempts after an answer reveal (independent = false) are excluded from evidence.
 * - No evidence → Not assessed (never "failure").
 */
export function computeObjectiveProgress(
  objective: Pick<LearningObjective, "id" | "objectiveKey">,
  mappedQuestionIds: string[],
  attempts: Attempt[],
  rule: EvidenceRule,
  override: ObjectiveOverride | null = null,
): ObjectiveProgress {
  const mapped = new Set(mappedQuestionIds);
  const relevant = attempts.filter((a) => mapped.has(a.questionId)).sort(byDateAsc);
  const evidence: EvidenceItem[] = [];
  const firstByQuestion = new Map<string, Attempt>();
  for (const a of relevant) {
    let note = "";
    let counted = false;
    if (!a.independent) note = "Not independent: this question had been seen (and its answer shown) before.";
    else if (firstByQuestion.has(a.questionId)) note = "Repeat of a question already counted; not new evidence.";
    else {
      firstByQuestion.set(a.questionId, a);
      counted = true;
      note = isTransfer(a) ? "Counted (rematch question)." : "Counted.";
    }
    evidence.push({ attemptId: a.id, questionId: a.questionId, kind: a.kind, isCorrect: a.isCorrect, independent: a.independent, createdAt: a.createdAt, counted, note });
  }

  const counted = [...firstByQuestion.values()].sort(byDateAsc);
  const window = counted.slice(-rule.minDistinctQuestions);
  const recentCorrect = window.filter((a) => a.isCorrect).length;
  const latest = counted.length ? counted[counted.length - 1] : null;
  const transferCorrect = counted.filter((a) => isTransfer(a) && a.isCorrect).length;
  const supportedPractice = relevant.filter((a) => a.practiceCompletedAt).length;

  const reasons: string[] = [];
  let computed: ObjectiveStatus;
  if (!mapped.size) {
    computed = "not_assessed";
    reasons.push("No questions are mapped to this objective yet.");
  } else if (!counted.length) {
    computed = "not_assessed";
    reasons.push("No independent answers on mapped questions yet.");
  } else if (counted.length < rule.minDistinctQuestions) {
    computed = "in_progress";
    reasons.push(`${counted.length} of ${rule.minDistinctQuestions} different questions answered so far.`);
  } else {
    const meetsRecent = recentCorrect >= rule.minCorrectInRecent;
    const meetsLatest = !rule.requireLatestCorrect || Boolean(latest?.isCorrect);
    const meetsTransfer = !rule.requireTransferCorrect || transferCorrect > 0;
    reasons.push(`${recentCorrect} of the most recent ${window.length} different questions correct (rule needs ${rule.minCorrectInRecent}).`);
    if (rule.requireLatestCorrect) reasons.push(latest?.isCorrect ? "Most recent question correct." : "Most recent question not yet correct.");
    if (rule.requireTransferCorrect)
      reasons.push(transferCorrect ? `${transferCorrect} correct rematch question(s).` : "No correct rematch question yet.");
    if (meetsRecent && meetsLatest && meetsTransfer) computed = "demonstrated";
    else if (meetsRecent && meetsLatest && !meetsTransfer) computed = "in_progress"; // performance OK; needs a rematch to confirm
    else computed = "needs_practice";
  }
  const excludedAttempts = evidence.filter((e) => !e.counted).length;
  if (excludedAttempts) reasons.push(`${excludedAttempts} attempt(s) not counted (repeats or previously seen questions).`);

  const ov = override && override.objectiveId === objective.id ? override : null;
  return {
    objectiveId: objective.id,
    objectiveKey: objective.objectiveKey,
    status: ov ? ov.status : computed,
    computedStatus: computed,
    override: ov ? { status: ov.status, reason: ov.reason, createdAt: ov.createdAt } : null,
    mappedQuestionCount: mapped.size,
    distinctQuestions: counted.length,
    recent: window.map((a) => ({ questionId: a.questionId, isCorrect: a.isCorrect, createdAt: a.createdAt })),
    recentCorrect,
    latestCorrect: latest ? latest.isCorrect : null,
    transferCorrect,
    supportedPractice,
    excludedAttempts,
    lastActivity: relevant.length ? relevant[relevant.length - 1].createdAt : null,
    reasons,
    evidence,
  };
}

/** A lecture is demonstrated only when ALL its required objectives are demonstrated. */
export function lectureStatus(objectives: { required: boolean; status: ObjectiveStatus }[]): ObjectiveStatus {
  const req = objectives.filter((o) => o.required);
  if (!req.length) return "not_assessed";
  if (req.every((o) => o.status === "demonstrated")) return "demonstrated";
  if (req.every((o) => o.status === "not_assessed")) return "not_assessed";
  if (req.some((o) => o.status === "needs_practice")) return "needs_practice";
  return "in_progress";
}

export interface NextStepCandidate {
  objectiveId: string;
  status: ObjectiveStatus;
  hasPractice: boolean;
  order: number;
}

/** Rule-based "next step": earliest objective needing practice, then in progress, then not yet assessed. */
export function ruleBasedNextObjective(candidates: NextStepCandidate[]): string | null {
  const rank: Record<ObjectiveStatus, number> = { needs_practice: 0, in_progress: 1, not_assessed: 2, demonstrated: 3 };
  const options = candidates.filter((c) => c.hasPractice && c.status !== "demonstrated").sort((a, b) => rank[a.status] - rank[b.status] || a.order - b.order);
  return options[0]?.objectiveId ?? null;
}
