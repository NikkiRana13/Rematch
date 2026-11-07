import { SEED_PASSAGES, SEED_QUESTIONS } from "../content/seed";
import type { AnalysisInput } from "./types";
import type { Fixture } from "./fixtures";

export function fixtureToInput(f: Fixture): AnalysisInput {
  const q = SEED_QUESTIONS.find((x) => x.id === f.questionId);
  if (!q) throw new Error(`Fixture ${f.id}: unknown question ${f.questionId}`);
  const passage = q.passageId ? SEED_PASSAGES.find((p) => p.id === q.passageId)!.body : null;
  return {
    subject: q.subject,
    skill: q.skill,
    skillFocus: q.skillFocus,
    passage,
    prompt: q.prompt,
    answerChoices: q.answerChoices,
    correctAnswer: q.correctAnswer,
    referenceExplanation: q.referenceExplanation,
    selectedAnswer: f.selectedAnswer,
    isCorrect: f.selectedAnswer === q.correctAnswer,
    studentText: f.reasoning,
    allowedMisconceptions: q.allowedMisconceptions,
  };
}
