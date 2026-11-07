import { describe, expect, it } from "vitest";
import { computeObjectiveProgress, DEFAULT_EVIDENCE_RULE, lectureStatus, ruleBasedNextObjective, validateRule } from "./progress";
import type { Attempt, ObjectiveOverride } from "./types";

const obj = { id: "o1", objectiveKey: "k1" };
const mapped = ["q1", "q2", "q3", "q4"];
let t = 0;
const A = (questionId: string, isCorrect: boolean, over: Partial<Attempt> = {}): Attempt =>
  ({
    id: `a${++t}`,
    questionId,
    isCorrect,
    kind: "initial",
    independent: true,
    support: "none",
    practiceCompletedAt: null,
    createdAt: `2026-11-01T00:00:${String(t).padStart(2, "0")}Z`,
    ...over,
  }) as Attempt;

const run = (attempts: Attempt[], m = mapped, rule = DEFAULT_EVIDENCE_RULE, ov: ObjectiveOverride | null = null) =>
  computeObjectiveProgress(obj, m, attempts, rule, ov);

describe("objective progress rule", () => {
  it("shows Not assessed (not failure) when there is no evidence", () => {
    expect(run([]).status).toBe("not_assessed");
    expect(run([A("q1", true)], []).status).toBe("not_assessed"); // nothing mapped
  });

  it("ignores attempts on questions that are not explicitly mapped", () => {
    const r = run([A("other1", true), A("other2", true), A("other3", true, { kind: "comeback" })]);
    expect(r.status).toBe("not_assessed");
    expect(r.evidence).toHaveLength(0);
  });

  it("some evidence but too little for a decision → In progress", () => {
    expect(run([A("q1", true), A("q2", true)]).status).toBe("in_progress");
  });

  it("demonstrated: 3 distinct, 2 of last 3 correct, latest correct, a correct rematch", () => {
    const r = run([A("q1", false), A("q2", true), A("q3", true, { kind: "roadmap" })]);
    expect(r.status).toBe("demonstrated");
    expect(r).toMatchObject({ distinctQuestions: 3, recentCorrect: 2, transferCorrect: 1, latestCorrect: true });
  });

  it("repeating one question cannot satisfy the rule", () => {
    const r = run([
      A("q1", true),
      A("q1", true, { kind: "roadmap", independent: false }),
      A("q1", true, { kind: "roadmap", independent: false }),
      A("q1", true, { kind: "roadmap" }), // even if (wrongly) marked independent, a repeat is not new evidence
    ]);
    expect(r.distinctQuestions).toBe(1);
    expect(r.status).toBe("in_progress");
    expect(r.excludedAttempts).toBe(3);
  });

  it("answer-revealed (non-independent) attempts never count as transfer evidence", () => {
    const r = run([A("q1", true), A("q2", true), A("q3", true, { kind: "roadmap", independent: false })]);
    expect(r.transferCorrect).toBe(0);
    expect(r.distinctQuestions).toBe(2);
    expect(r.status).toBe("in_progress");
  });

  it("good performance without any correct rematch stays In progress (needs a rematch to confirm)", () => {
    expect(run([A("q1", true), A("q2", true), A("q3", true)]).status).toBe("in_progress");
  });

  it("sufficient recent evidence below the rule → Needs practice", () => {
    expect(run([A("q1", true, { kind: "roadmap" }), A("q2", false), A("q3", false)]).status).toBe("needs_practice");
  });

  it("a later independent error moves Demonstrated back to Needs practice", () => {
    const base = [A("q1", true), A("q2", true), A("q3", true, { kind: "comeback" })];
    expect(run(base).status).toBe("demonstrated");
    expect(run([...base, A("q4", false)]).status).toBe("needs_practice");
  });

  it("teacher override changes the shown status but keeps the computed status and evidence", () => {
    const ov = { objectiveId: "o1", status: "demonstrated", reason: "Showed it in class discussion", createdAt: "t" } as ObjectiveOverride;
    const r = run([A("q1", false)], mapped, DEFAULT_EVIDENCE_RULE, ov);
    expect(r).toMatchObject({ status: "demonstrated", computedStatus: "in_progress", override: { reason: "Showed it in class discussion" } });
    expect(r.evidence).toHaveLength(1);
  });

  it("validates teacher rule options", () => {
    expect(validateRule(DEFAULT_EVIDENCE_RULE)).toBeNull();
    expect(validateRule({ ...DEFAULT_EVIDENCE_RULE, minCorrectInRecent: 1 })).not.toBeNull();
    expect(validateRule({ ...DEFAULT_EVIDENCE_RULE, minDistinctQuestions: 5 as 4 })).not.toBeNull();
  });
});

describe("lecture status and next step", () => {
  it("lecture is demonstrated only when every required objective is", () => {
    expect(lectureStatus([{ required: true, status: "demonstrated" }, { required: true, status: "in_progress" }])).toBe("in_progress");
    expect(lectureStatus([{ required: true, status: "demonstrated" }, { required: false, status: "not_assessed" }])).toBe("demonstrated");
    expect(lectureStatus([{ required: true, status: "not_assessed" }])).toBe("not_assessed");
    expect(lectureStatus([{ required: true, status: "demonstrated" }, { required: true, status: "needs_practice" }])).toBe("needs_practice");
  });

  it("rule-based next step prefers needs-practice objectives that have practice available", () => {
    expect(
      ruleBasedNextObjective([
        { objectiveId: "a", status: "not_assessed", hasPractice: true, order: 0 },
        { objectiveId: "b", status: "needs_practice", hasPractice: false, order: 1 },
        { objectiveId: "c", status: "needs_practice", hasPractice: true, order: 2 },
      ]),
    ).toBe("c");
    expect(ruleBasedNextObjective([{ objectiveId: "a", status: "demonstrated", hasPractice: true, order: 0 }])).toBeNull();
  });
});
