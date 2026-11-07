import { isMisconceptionCode } from "./content/taxonomy";
import type { Analysis, Attempt, PracticeResource, Question, ReasoningStatus, Route } from "./types";

export interface RouteInput {
  question: Question;
  isCorrect: boolean;
  reasoningStatus: ReasoningStatus;
  /** Latest analysis for the attempt (null if none). */
  analysis: Pick<Analysis, "status" | "category" | "needsClarification"> | null;
  clarificationUsed: boolean;
  practice: PracticeResource[];
  /** The follow-up question referenced by question.followUpQuestionId, if loaded. */
  followUp: Question | null;
}

function verifiedFollowUp(input: RouteInput): Question | null {
  const f = input.followUp;
  if (!f || !input.question.followUpQuestionId) return null;
  if (f.id !== input.question.followUpQuestionId || !f.verified || f.skill !== input.question.skill) return null;
  if (f.questionRole !== "follow-up") return null;
  return f;
}

export function findTargetedPractice(input: RouteInput, code: string): PracticeResource | null {
  return (
    input.practice.find(
      (p) => p.verified && p.kind === "targeted" && p.misconception === code && p.skill === input.question.skill,
    ) ?? null
  );
}

export function findGeneralPractice(input: RouteInput): PracticeResource | null {
  const linked = input.practice.find(
    (p) => p.id === input.question.practiceResourceId && p.verified && p.skill === input.question.skill,
  );
  if (linked) return linked;
  return input.practice.find((p) => p.verified && p.kind === "general" && p.skill === input.question.skill) ?? null;
}

function findSlipPractice(input: RouteInput): PracticeResource | null {
  return input.practice.find((p) => p.verified && p.kind === "slip" && p.skill === input.question.skill) ?? null;
}

/**
 * Explicit, rule-based routing. AI output only influences which practice is shown;
 * it never changes correctness, points, or comeback eligibility.
 */
export function decideRoute(input: RouteInput): Route {
  const { question, isCorrect, analysis, clarificationUsed, reasoningStatus } = input;
  const followUp = verifiedFollowUp(input);
  const category = analysis?.status === "completed" ? analysis.category : null;

  if (isCorrect) {
    // Correct answer with faulty reasoning: optional practice, no score change, no comeback.
    if (category && (isMisconceptionCode(category) || category === "OTHER_MISCONCEPTION")) {
      const targeted = isMisconceptionCode(category) ? findTargetedPractice(input, category) : null;
      const practice = targeted ?? findGeneralPractice(input);
      return {
        path: "optional_targeted_practice",
        practiceResourceId: practice?.id ?? null,
        comebackQuestionId: null,
        teacherReview: category === "OTHER_MISCONCEPTION",
        reason: "correct_answer_reasoning_may_need_review",
        adaptiveSupport: Boolean(targeted),
      };
    }
    return {
      path: "continue",
      practiceResourceId: null,
      comebackQuestionId: null,
      teacherReview: false,
      reason: "correct",
      adaptiveSupport: false,
    };
  }

  const comebackQuestionId = followUp?.id ?? null;
  const general = findGeneralPractice(input);
  const generalRoute = (reason: string, teacherReview: boolean): Route => ({
    path: general ? "general_practice" : "continue",
    practiceResourceId: general?.id ?? null,
    comebackQuestionId,
    teacherReview,
    reason,
    adaptiveSupport: false,
  });

  if (!analysis || analysis.status === "unavailable") {
    return generalRoute("analysis_unavailable", true);
  }

  if (reasoningStatus !== "provided") {
    // "I'm not sure" or skipped is allowed. No diagnosis is forced.
    return generalRoute("no_reasoning_provided", false);
  }

  if (category === "INSUFFICIENT_EVIDENCE" || analysis.needsClarification) {
    if (!clarificationUsed) {
      return {
        path: "clarify",
        practiceResourceId: null,
        comebackQuestionId,
        teacherReview: false,
        reason: "clarification_requested",
        adaptiveSupport: false,
      };
    }
    return generalRoute("still_unclear_after_clarification", true);
  }

  if (isMisconceptionCode(category)) {
    const allowed = question.allowedMisconceptions.includes(category);
    const targeted = allowed ? findTargetedPractice(input, category) : null;
    if (targeted && followUp) {
      return {
        path: "targeted_practice",
        practiceResourceId: targeted.id,
        comebackQuestionId: followUp.id,
        teacherReview: false,
        reason: "supported_misconception",
        adaptiveSupport: true,
      };
    }
    return generalRoute("misconception_without_verified_targeted_content", true);
  }

  if (category === "SLIP_WITH_CORRECT_METHOD") {
    const slip = findSlipPractice(input);
    return {
      path: "slip_review",
      practiceResourceId: slip?.id ?? null,
      comebackQuestionId,
      teacherReview: false,
      reason: "slip",
      adaptiveSupport: false,
    };
  }

  if (category === "OTHER_MISCONCEPTION") return generalRoute("other_misconception", true);

  // NO_MISCONCEPTION_DETECTED with an incorrect answer: reasoning and answer disagree.
  return generalRoute("reasoning_and_answer_disagree", true);
}

export type NextStep =
  | { type: "question"; questionId: string; index: number; total: number }
  | { type: "clarify"; attemptId: string; questionId: string; clarificationQuestion: string | null }
  | { type: "practice"; attemptId: string; practiceResourceId: string; optional: boolean; path: Route["path"] }
  | { type: "comeback"; attemptId: string; questionId: string }
  | { type: "done" }
  | { type: "closed" };

/** Derive a participant's next step from stored records, so the flow is resumable on any device. */
export function nextStep(
  questionIds: string[],
  attempts: Attempt[],
  latestAnalysisByAttempt: Map<string, Pick<Analysis, "clarificationQuestion">>,
): NextStep {
  for (let i = 0; i < questionIds.length; i++) {
    const qid = questionIds[i];
    const initial = attempts.find((a) => a.kind === "initial" && a.questionId === qid);
    if (!initial) return { type: "question", questionId: qid, index: i, total: questionIds.length };
    const route = initial.route;
    if (!route) continue;
    if (route.path === "clarify" && initial.clarificationStatus === "requested") {
      return {
        type: "clarify",
        attemptId: initial.id,
        questionId: qid,
        clarificationQuestion: latestAnalysisByAttempt.get(initial.id)?.clarificationQuestion ?? null,
      };
    }
    if (route.practiceResourceId && !initial.practiceCompletedAt) {
      return {
        type: "practice",
        attemptId: initial.id,
        practiceResourceId: route.practiceResourceId,
        optional: route.path === "optional_targeted_practice",
        path: route.path,
      };
    }
    if (route.comebackQuestionId && !initial.isCorrect) {
      const comeback = attempts.find((a) => a.kind === "comeback" && a.originalAttemptId === initial.id);
      if (!comeback) return { type: "comeback", attemptId: initial.id, questionId: route.comebackQuestionId };
    }
  }
  return { type: "done" };
}
