import type { MisconceptionCode, Subject, SkillId, AnswerChoice } from "../types";
import type { Classification } from "./validate";

export interface AnalysisInput {
  subject: Subject;
  skill: SkillId;
  skillFocus: string;
  passage: string | null;
  prompt: string;
  answerChoices: AnswerChoice[];
  correctAnswer: string;
  referenceExplanation: string;
  selectedAnswer: string;
  /** Determined by ordinary server code before analysis. */
  isCorrect: boolean;
  /** Full student text to analyse (original reasoning plus any clarification). */
  studentText: string;
  allowedMisconceptions: MisconceptionCode[];
}

export type AnalysisOutcome =
  | { status: "completed"; value: Classification }
  | { status: "unavailable"; errorCode: string };

/** Replaceable provider interface. */
export interface ReasoningAnalyzer {
  readonly provider: string;
  readonly model: string | null;
  readonly promptVersion: string;
  analyze(input: AnalysisInput): Promise<AnalysisOutcome>;
}
