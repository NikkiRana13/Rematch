import { describe, expect, it } from "vitest";
import { SEED_PRACTICE, seedQuestion } from "./content/seed";
import { decideRoute, nextStep, type RouteInput } from "./routing";
import type { Attempt, Category } from "./types";

const pizza = seedQuestion("q-math-frac-pizza");
const ribbon = seedQuestion("q-math-frac-ribbon");
const amina = seedQuestion("q-read-inf-amina");
const leo = seedQuestion("q-read-inf-leo");
const mainIdea = seedQuestion("q-read-main-amina");

function input(over: Partial<RouteInput> & { category?: Category | null; status?: "completed" | "unavailable"; needsClarification?: boolean }): RouteInput {
  const { category = null, status = "completed", needsClarification = false, ...rest } = over;
  return {
    question: pizza,
    isCorrect: false,
    reasoningStatus: "provided",
    analysis: { status, category, needsClarification },
    clarificationUsed: false,
    practice: SEED_PRACTICE,
    followUp: ribbon,
    ...rest,
  };
}

describe("follow-up selection and routing", () => {
  it("supported misconception → matching targeted practice + verified same-skill comeback", () => {
    const r = decideRoute(input({ category: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT" }));
    expect(r).toMatchObject({ path: "targeted_practice", practiceResourceId: "pr-math-frac-larger-denominator", comebackQuestionId: ribbon.id, adaptiveSupport: true });
    const r2 = decideRoute(input({ category: "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT" }));
    expect(r2.practiceResourceId).toBe("pr-math-frac-same-numerator-equal");
  });

  it("reading misconceptions route to reading practice and reading follow-up", () => {
    const r = decideRoute(input({ question: amina, followUp: leo, category: "EXPLICIT_STATEMENT_REQUIRED" }));
    expect(r).toMatchObject({ path: "targeted_practice", practiceResourceId: "pr-read-inf-explicit", comebackQuestionId: leo.id });
  });

  it("insufficient evidence → one clarification, then general practice + teacher review", () => {
    expect(decideRoute(input({ category: "INSUFFICIENT_EVIDENCE", needsClarification: true })).path).toBe("clarify");
    const after = decideRoute(input({ category: "INSUFFICIENT_EVIDENCE", clarificationUsed: true }));
    expect(after).toMatchObject({ path: "general_practice", practiceResourceId: "pr-math-frac-general", teacherReview: true, comebackQuestionId: ribbon.id });
  });

  it("other misconception → general practice + host review", () => {
    expect(decideRoute(input({ category: "OTHER_MISCONCEPTION" }))).toMatchObject({ path: "general_practice", teacherReview: true, adaptiveSupport: false });
  });

  it("slip → brief feedback and a fresh same-skill question", () => {
    expect(decideRoute(input({ category: "SLIP_WITH_CORRECT_METHOD" }))).toMatchObject({ path: "slip_review", practiceResourceId: "pr-math-frac-slip", comebackQuestionId: ribbon.id });
  });

  it("correct answer with faulty reasoning → optional practice, no comeback", () => {
    const r = decideRoute(input({ isCorrect: true, category: "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT" }));
    expect(r).toMatchObject({ path: "optional_targeted_practice", comebackQuestionId: null });
  });

  it("correct answer with sound or unclear reasoning just continues", () => {
    expect(decideRoute(input({ isCorrect: true, category: "NO_MISCONCEPTION_DETECTED" })).path).toBe("continue");
    expect(decideRoute(input({ isCorrect: true, category: "INSUFFICIENT_EVIDENCE", needsClarification: true })).path).toBe("continue");
  });

  it("'I'm not sure' is accepted without forcing a diagnosis or clarification", () => {
    const r = decideRoute(input({ reasoningStatus: "not_sure", category: "INSUFFICIENT_EVIDENCE" }));
    expect(r).toMatchObject({ path: "general_practice", reason: "no_reasoning_provided", teacherReview: false });
  });

  it("analysis unavailable → general practice with review flag, no fabricated diagnosis", () => {
    expect(decideRoute(input({ status: "unavailable" }))).toMatchObject({ path: "general_practice", reason: "analysis_unavailable", adaptiveSupport: false });
    expect(decideRoute(input({ analysis: null }))).toMatchObject({ reason: "analysis_unavailable" });
  });

  it("never offers an unverified or mismatched follow-up", () => {
    expect(decideRoute(input({ category: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", followUp: { ...ribbon, verified: false } }))).toMatchObject({
      comebackQuestionId: null,
      adaptiveSupport: false,
    });
    expect(decideRoute(input({ category: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", followUp: leo })).comebackQuestionId).toBeNull();
  });

  it("does not advertise adaptive support for skills without verified content", () => {
    const r = decideRoute(input({ question: mainIdea, followUp: null, category: "OTHER_MISCONCEPTION" }));
    expect(r).toMatchObject({ path: "continue", practiceResourceId: null, comebackQuestionId: null, adaptiveSupport: false });
  });
});

describe("nextStep", () => {
  const mk = (over: Partial<Attempt>): Attempt =>
    ({ id: "a1", kind: "initial", questionId: pizza.id, isCorrect: false, clarificationStatus: "none", practiceCompletedAt: null, route: null, ...over }) as Attempt;
  const ids = [pizza.id, amina.id];
  const empty = new Map();

  it("walks question → practice → comeback → next question → done", () => {
    expect(nextStep(ids, [], empty)).toMatchObject({ type: "question", questionId: pizza.id, index: 0 });
    const route = decideRoute(input({ category: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT" }));
    const a = mk({ route });
    expect(nextStep(ids, [a], empty)).toMatchObject({ type: "practice", attemptId: "a1" });
    const b = { ...a, practiceCompletedAt: "t" };
    expect(nextStep(ids, [b], empty)).toMatchObject({ type: "comeback", questionId: ribbon.id });
    const cb = mk({ id: "c1", kind: "comeback", questionId: ribbon.id, originalAttemptId: "a1" });
    expect(nextStep(ids, [b, cb], empty)).toMatchObject({ type: "question", questionId: amina.id });
    const a2 = mk({ id: "a2", questionId: amina.id, isCorrect: true, route: decideRoute(input({ isCorrect: true, category: "NO_MISCONCEPTION_DETECTED" })) });
    expect(nextStep(ids, [b, cb, a2], empty)).toEqual({ type: "done" });
  });

  it("asks for clarification only while requested", () => {
    const route = decideRoute(input({ category: "INSUFFICIENT_EVIDENCE", needsClarification: true }));
    expect(nextStep(ids, [mk({ route, clarificationStatus: "requested" })], new Map([["a1", { clarificationQuestion: "Which?" }]]))).toMatchObject({
      type: "clarify",
      clarificationQuestion: "Which?",
    });
  });
});
