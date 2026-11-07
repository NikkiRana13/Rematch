import type { Attempt, Question } from "./types";

export const FIRST_ATTEMPT_POINTS = 100;
export const COMEBACK_POINTS = 50;

export class ScoringError extends Error {
  constructor(
    public code: "invalid_choice" | "comeback_not_allowed" | "wrong_question",
    message: string,
  ) {
    super(message);
  }
}

/** Deterministic correctness check. Never consults AI output. */
export function isCorrectChoice(question: Question, selectedAnswer: string): boolean {
  if (!question.answerChoices.some((c) => c.id === selectedAnswer)) {
    throw new ScoringError("invalid_choice", "Selected answer is not one of the question's choices.");
  }
  return question.correctAnswer === selectedAnswer;
}

export function scoreInitial(question: Question, selectedAnswer: string): { isCorrect: boolean; points: number } {
  const isCorrect = isCorrectChoice(question, selectedAnswer);
  return { isCorrect, points: isCorrect ? FIRST_ATTEMPT_POINTS : 0 };
}

/**
 * Comeback points are only available when the original first attempt was incorrect
 * AND the route offered a comeback for exactly this follow-up question.
 */
export function scoreComeback(
  original: Pick<Attempt, "isCorrect" | "route" | "kind">,
  followUp: Question,
  selectedAnswer: string,
): { isCorrect: boolean; points: number } {
  if (original.kind === "comeback" || original.isCorrect) {
    throw new ScoringError("comeback_not_allowed", "Comeback is only available after an incorrect first attempt.");
  }
  if (!original.route || original.route.comebackQuestionId !== followUp.id) {
    throw new ScoringError("wrong_question", "This follow-up question was not offered for that attempt.");
  }
  const isCorrect = isCorrectChoice(followUp, selectedAnswer);
  // Roadmap practice never awards competition points.
  return { isCorrect, points: isCorrect && original.kind === "initial" ? COMEBACK_POINTS : 0 };
}

export interface ScoreSummary {
  initialPoints: number;
  comebackPoints: number;
  initialCorrect: number;
  initialTotal: number;
  comebackCorrect: number;
  comebackTotal: number;
}

export function summarizeScore(attempts: Attempt[]): ScoreSummary {
  const initial = attempts.filter((a) => a.kind === "initial");
  const comeback = attempts.filter((a) => a.kind === "comeback");
  return {
    initialPoints: initial.reduce((s, a) => s + a.points, 0),
    comebackPoints: comeback.reduce((s, a) => s + a.points, 0),
    initialCorrect: initial.filter((a) => a.isCorrect).length,
    initialTotal: initial.length,
    comebackCorrect: comeback.filter((a) => a.isCorrect).length,
    comebackTotal: comeback.length,
  };
}
