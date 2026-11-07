import { randomUUID } from "node:crypto";
import type { Db } from "../db/types";
import type { ReasoningAnalyzer } from "../analysis/types";
import type { Analysis, Attempt, Passage, Question } from "../types";

/** Text actually analysed: the student's reasoning plus any clarification, verbatim. */
export function studentTextFor(attempt: Pick<Attempt, "reasoning" | "clarificationText">): string {
  return attempt.clarificationText ? `${attempt.reasoning}\n${attempt.clarificationText}`.trim() : attempt.reasoning;
}

/**
 * Runs the analyser and stores the outcome, including "unavailable" outcomes.
 * Empty / "not sure" reasoning is recorded as insufficient evidence without calling a provider.
 */
export async function analyzeAndStore(opts: {
  db: Db;
  analyzer: ReasoningAnalyzer;
  attempt: Attempt;
  question: Question;
  passage: Passage | null;
  stage: Analysis["stage"];
}): Promise<Analysis> {
  const { db, analyzer, attempt, question, passage, stage } = opts;
  const text = studentTextFor(attempt);
  const base = {
    id: randomUUID(),
    attemptId: attempt.id,
    stage,
    isSynthetic: false,
    createdAt: new Date().toISOString(),
  };

  let row: Analysis;
  if (attempt.reasoningStatus !== "provided" && !attempt.clarificationText) {
    row = {
      ...base,
      status: "completed",
      provider: "rule:no-reasoning",
      model: null,
      promptVersion: "n/a",
      category: "INSUFFICIENT_EVIDENCE",
      evidenceQuote: null,
      explanation:
        attempt.reasoningStatus === "not_sure"
          ? "The student chose \"I'm not sure\"; no diagnosis is made."
          : "The student skipped the explanation; no diagnosis is made.",
      needsClarification: false,
      clarificationQuestion: null,
      errorCode: null,
    };
  } else {
    const outcome = await analyzer
      .analyze({
        subject: question.subject,
        skill: question.skill,
        skillFocus: question.skillFocus,
        passage: passage?.body ?? null,
        prompt: question.prompt,
        answerChoices: question.answerChoices,
        correctAnswer: question.correctAnswer,
        referenceExplanation: question.referenceExplanation,
        selectedAnswer: attempt.selectedAnswer,
        isCorrect: attempt.isCorrect,
        studentText: text,
        allowedMisconceptions: question.allowedMisconceptions,
      })
      .catch((): { status: "unavailable"; errorCode: string } => ({ status: "unavailable", errorCode: "analyzer_exception" }));
    const meta = { provider: analyzer.provider, model: analyzer.model, promptVersion: analyzer.promptVersion };
    row =
      outcome.status === "completed"
        ? {
            ...base,
            ...meta,
            status: "completed",
            category: outcome.value.category,
            evidenceQuote: outcome.value.evidenceQuote,
            explanation: outcome.value.explanation,
            needsClarification: outcome.value.needsClarification,
            clarificationQuestion: outcome.value.clarificationQuestion,
            errorCode: null,
          }
        : {
            ...base,
            ...meta,
            status: "unavailable",
            category: null,
            evidenceQuote: null,
            explanation: null,
            needsClarification: false,
            clarificationQuestion: null,
            errorCode: outcome.errorCode,
          };
  }
  return db.insert("analyses", row);
}
