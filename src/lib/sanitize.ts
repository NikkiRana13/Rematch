import type { AnswerChoice, Passage, PracticeResource, Question, SkillId, Subject } from "./types";

/** Question shape safe to send to a participant: no answer key, explanation, or hidden links. */
export interface StudentQuestion {
  id: string;
  subject: Subject;
  gradeLevel: number;
  skill: SkillId;
  skillFocus: string;
  prompt: string;
  reasoningPrompt: string;
  answerChoices: AnswerChoice[];
  passage: { title: string; body: string } | null;
}

export function toStudentQuestion(q: Question, passage: Passage | null): StudentQuestion {
  return {
    id: q.id,
    subject: q.subject,
    gradeLevel: q.gradeLevel,
    skill: q.skill,
    skillFocus: q.skillFocus,
    prompt: q.prompt,
    reasoningPrompt: q.reasoningPrompt,
    answerChoices: q.answerChoices.map((c) => ({ id: c.id, text: c.text })),
    passage: passage ? { title: passage.title, body: passage.body } : null,
  };
}

/** Practice content is safe to show (it never contains the follow-up question or its answer). */
export function toStudentPractice(p: PracticeResource) {
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    explanation: p.explanation,
    workedExample: p.workedExample,
  };
}

export const FORBIDDEN_STUDENT_KEYS = [
  "correctAnswer",
  "referenceExplanation",
  "followUpQuestionId",
  "allowedMisconceptions",
] as const;

/** Defensive deep check used in tests and before responding with student payloads in dev. */
export function containsForbiddenKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const v of value) {
      const f = containsForbiddenKey(v);
      if (f) return f;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((FORBIDDEN_STUDENT_KEYS as readonly string[]).includes(k)) return k;
      const f = containsForbiddenKey(v);
      if (f) return f;
    }
  }
  return null;
}
