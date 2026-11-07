import { describe, expect, it } from "vitest";
import { seedQuestion } from "./content/seed";
import { COMEBACK_POINTS, FIRST_ATTEMPT_POINTS, ScoringError, scoreComeback, scoreInitial, summarizeScore } from "./scoring";
import type { Attempt, Route } from "./types";

const pizza = seedQuestion("q-math-frac-pizza");
const ribbon = seedQuestion("q-math-frac-ribbon");
const route: Route = {
  path: "targeted_practice",
  practiceResourceId: "pr-math-frac-larger-denominator",
  comebackQuestionId: ribbon.id,
  teacherReview: false,
  reason: "supported_misconception",
  adaptiveSupport: true,
};

describe("scoring", () => {
  it("awards 100 for a correct first attempt and 0 otherwise", () => {
    expect(scoreInitial(pizza, "B")).toEqual({ isCorrect: true, points: FIRST_ATTEMPT_POINTS });
    expect(scoreInitial(pizza, "A")).toEqual({ isCorrect: false, points: 0 });
  });

  it("rejects choices that do not exist", () => {
    expect(() => scoreInitial(pizza, "Z")).toThrow(ScoringError);
  });

  it("awards 50 comeback points only after an incorrect first attempt", () => {
    expect(scoreComeback({ kind: "initial", isCorrect: false, route }, ribbon, "A")).toEqual({ isCorrect: true, points: COMEBACK_POINTS });
    expect(scoreComeback({ kind: "initial", isCorrect: false, route }, ribbon, "B")).toEqual({ isCorrect: false, points: 0 });
    expect(() => scoreComeback({ kind: "initial", isCorrect: true, route }, ribbon, "A")).toThrow(/only available/);
  });

  it("refuses comeback on a question that was not offered", () => {
    expect(() => scoreComeback({ kind: "initial", isCorrect: false, route: { ...route, comebackQuestionId: "other" } }, ribbon, "A")).toThrow(
      /not offered/,
    );
  });

  it("summarizes initial and comeback points separately", () => {
    const a = (kind: Attempt["kind"], isCorrect: boolean, points: number) => ({ kind, isCorrect, points }) as Attempt;
    expect(summarizeScore([a("initial", true, 100), a("initial", false, 0), a("comeback", true, 50)])).toEqual({
      initialPoints: 100,
      comebackPoints: 50,
      initialCorrect: 1,
      initialTotal: 2,
      comebackCorrect: 1,
      comebackTotal: 1,
    });
  });
});
