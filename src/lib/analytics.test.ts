import { describe, expect, it } from "vitest";
import { computeCompetitionAnalytics, formatRatio, learnerProgress, ratio } from "./analytics";
import { recommendNextSprint } from "./recommend";
import { SEED_QUESTIONS } from "./content/seed";
import type { Analysis, Attempt, Competition, Participant } from "./types";

const comp = {
  id: "c1",
  subject: "math",
  questionIds: ["q1", "q2"],
} as Competition;

const P = (id: string): Participant => ({ id, competitionId: "c1", learnerId: id, nickname: id, isSynthetic: false, joinedAt: "t" });
let n = 0;
const A = (participantId: string, questionId: string, isCorrect: boolean, over: Partial<Attempt> = {}): Attempt =>
  ({
    id: `a${++n}`,
    participantId,
    competitionId: "c1",
    questionId,
    subject: "math",
    skill: "math.fractions_intro",
    kind: "initial",
    isCorrect,
    points: isCorrect ? 100 : 0,
    clarificationStatus: "none",
    teacherReview: false,
    readAloudUsed: false,
    createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
    ...over,
  }) as Attempt;
const AN = (attemptId: string, category: Analysis["category"], evidenceQuote: string | null): Analysis =>
  ({ id: `an-${attemptId}`, attemptId, stage: "initial", status: "completed", provider: "anthropic", category, evidenceQuote, isSynthetic: false, createdAt: "t" }) as Analysis;

describe("analytics", () => {
  it("computes completion, skill accuracy, comeback success and misconception counts with denominators", () => {
    const participants = [P("p1"), P("p2"), P("p3")];
    const a1 = A("p1", "q1", false);
    const a2 = A("p1", "q2", true);
    const a3 = A("p2", "q1", false);
    const a4 = A("p3", "q1", true);
    const cb1 = A("p1", "f1", true, { kind: "comeback", originalAttemptId: a1.id, points: 50 });
    const cb2 = A("p2", "f1", false, { kind: "comeback", originalAttemptId: a3.id, points: 0 });
    const analyses = [
      AN(a1.id, "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", "8 is bigger"),
      AN(a3.id, "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", null), // no quote → not counted as supporting
      AN(a4.id, "NO_MISCONCEPTION_DETECTED", null),
    ];
    const r = computeCompetitionAnalytics({
      competition: comp,
      questions: [],
      participants,
      attempts: [a1, a2, a3, a4, cb1, cb2],
      analyses,
      overrides: [],
    });
    expect(r.completion).toEqual(ratio(1, 3));
    // First attempts only: 2 correct of 4. Comebacks do not inflate it.
    expect(r.skillAccuracy[0].accuracy).toEqual(ratio(2, 4));
    expect(r.skillAccuracy[0].limitedEvidence).toBe(true);
    expect(r.comebackSuccess).toEqual(ratio(1, 2));
    expect(r.comebackPoints).toBe(50);
    expect(r.misconceptions).toHaveLength(1);
    // Distinct participants with supporting classification / participants with analysed reasoning.
    expect(r.misconceptions[0].participants).toEqual(ratio(1, 3));
  });

  it("counts a participant once per misconception even across multiple questions", () => {
    const a1 = A("p1", "q1", false);
    const a2 = A("p1", "q2", false);
    const r = computeCompetitionAnalytics({
      competition: comp,
      questions: [],
      participants: [P("p1")],
      attempts: [a1, a2],
      analyses: [AN(a1.id, "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT", "same"), AN(a2.id, "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT", "same")],
      overrides: [],
    });
    expect(r.misconceptions[0].participants).toEqual(ratio(1, 1));
    expect(r.misconceptions[0].evidence).toHaveLength(2);
  });

  it("formats ratios with denominators and handles zero", () => {
    expect(formatRatio(ratio(3, 4))).toBe("75% (3 of 4)");
    expect(formatRatio(ratio(0, 0))).toBe("— (0 of 0)");
  });

  it("learner progress uses most recent first attempt per distinct question and flags limited evidence", () => {
    const list = [A("p", "q1", false), A("p", "q1", true), A("p", "q2", true), A("p", "f1", true, { kind: "comeback" })];
    const [s] = learnerProgress(list);
    expect(s.distinctQuestions).toBe(2);
    expect(s.accuracy).toEqual(ratio(2, 2)); // latest q1 attempt is correct
    expect(s.limitedEvidence).toBe(true);
    expect(s.comebacks).toEqual(ratio(1, 1));
  });
});

describe("next-sprint recommendation", () => {
  const bank = SEED_QUESTIONS;
  const hist = (skill: Attempt["skill"], questionId: string, isCorrect: boolean) =>
    A("p", questionId, isCorrect, { skill, subject: skill.startsWith("math") ? "math" : "reading" });

  it("prioritizes skills with repeated recent errors, caps repetition, and includes review", () => {
    const history = [
      hist("math.fractions_intro", "q-math-frac-pizza", false),
      hist("math.fractions_intro", "q-math-frac-pizza", false),
      hist("math.fractions_intro", "q-math-frac-pizza", false),
      hist("math.place_value", "q-math-place-value", true),
    ];
    const r = recommendNextSprint("math", history, bank);
    expect(r.focusSkills).toEqual(["math.fractions_intro"]);
    const fracCount = r.questionIds.filter((id) => bank.find((q) => q.id === id)!.skill === "math.fractions_intro").length;
    expect(fracCount).toBeLessThanOrEqual(2);
    expect(r.reviewSkills.length).toBeGreaterThan(0);
    // Prefers the not-recently-attempted fraction question first.
    expect(r.questionIds[0]).toBe("q-math-frac-juice");
    // Only verified initial questions of the subject.
    for (const id of r.questionIds) {
      const q = bank.find((x) => x.id === id)!;
      expect(q.subject).toBe("math");
      expect(q.questionRole).toBe("initial");
    }
  });

  it("one error is not 'repeated'; falls back to balanced review", () => {
    const r = recommendNextSprint("reading", [hist("reading.inference", "q-read-inf-amina", false)], bank);
    expect(r.focusSkills).toEqual([]);
    expect(r.questionIds.length).toBeGreaterThan(0);
  });
});
