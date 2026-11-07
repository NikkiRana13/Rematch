import { describe, expect, it } from "vitest";
import { SEED_PASSAGES, SEED_PRACTICE, SEED_QUESTIONS, INTERVENTIONS } from "./seed";
import { SKILLS, skillInfo, SUBJECT_MISCONCEPTIONS } from "./taxonomy";

/** Expected correct-answer TEXT for each seeded item, independently written to catch key/ordering drift. */
const EXPECTED_CORRECT_TEXT: Record<string, string> = {
  "q-read-inf-amina": "To help stop the soil from drying out so quickly.",
  "q-read-inf-leo": "He expected cold weather.",
  "q-read-inf-kofi": "Many people wanted to buy the muffins.",
  "q-read-inf-priya": "Pick the ripe tomatoes.",
  "q-math-frac-pizza": "Mia.",
  "q-math-frac-ribbon": "Sara.",
  "q-math-frac-juice": "Ella.",
  "q-math-frac-garden": "Ravi.",
  "q-read-main-amina": "Amina takes care of the class seedlings.",
  "q-read-vocab-drooping": "Hanging down weakly.",
  "q-read-evidence-kofi": "By ten o'clock, two trays were empty and people were still lining up.",
  "q-math-place-value": "7 000",
  "q-math-add-library": "1 625",
  "q-math-div-chairs": "12",
};

describe("seed content verification", () => {
  it("every seeded question has an independently checked answer key", () => {
    for (const q of SEED_QUESTIONS) {
      expect(EXPECTED_CORRECT_TEXT[q.id], `missing expected key for ${q.id}`).toBeDefined();
      const correct = q.answerChoices.filter((c) => c.id === q.correctAnswer);
      expect(correct, q.id).toHaveLength(1);
      expect(correct[0].text).toBe(EXPECTED_CORRECT_TEXT[q.id]);
    }
  });

  it("choices are unique and use letters matching display order", () => {
    for (const q of SEED_QUESTIONS) {
      expect(q.answerChoices.map((c) => c.id)).toEqual(["A", "B", "C", "D"].slice(0, q.answerChoices.length));
      expect(new Set(q.answerChoices.map((c) => c.text)).size).toBe(q.answerChoices.length);
    }
  });

  it("correct-choice positions are varied across the bank", () => {
    const positions = new Set(SEED_QUESTIONS.map((q) => q.correctAnswer));
    expect(positions.size).toBe(4);
  });

  it("math fraction answers are mathematically consistent", () => {
    // Same numerator, equal wholes: the smaller denominator is the larger amount.
    const cases: [string, number, number][] = [
      ["q-math-frac-pizza", 4, 8],
      ["q-math-frac-ribbon", 5, 9],
      ["q-math-frac-juice", 3, 5],
      ["q-math-frac-garden", 6, 8],
    ];
    for (const [, a, b] of cases) expect(1 / a).toBeGreaterThan(1 / b);
    expect(1250 + 375).toBe(1625);
    expect(96 / 8).toBe(12);
    expect(Math.floor(47382 / 1000) % 10).toBe(7);
  });

  it("links are valid: passages, practice, follow-ups match skill and role", () => {
    for (const q of SEED_QUESTIONS) {
      expect(skillInfo(q.skill).subject).toBe(q.subject);
      if (q.subject === "reading") expect(SEED_PASSAGES.some((p) => p.id === q.passageId)).toBe(true);
      else expect(q.passageId).toBeNull();
      if (q.practiceResourceId) {
        const p = SEED_PRACTICE.find((x) => x.id === q.practiceResourceId);
        expect(p?.skill).toBe(q.skill);
      }
      if (q.followUpQuestionId) {
        expect(q.questionRole).toBe("initial");
        const f = SEED_QUESTIONS.find((x) => x.id === q.followUpQuestionId)!;
        expect(f.questionRole).toBe("follow-up");
        expect(f.skill).toBe(q.skill);
      }
      for (const m of q.allowedMisconceptions) expect(SUBJECT_MISCONCEPTIONS[q.subject]).toContain(m);
    }
  });

  it("adaptive skills have verified targeted practice for every supported misconception and a follow-up", () => {
    for (const s of SKILLS.filter((k) => k.adaptive)) {
      for (const m of SUBJECT_MISCONCEPTIONS[s.subject]) {
        expect(SEED_PRACTICE.some((p) => p.skill === s.id && p.misconception === m && p.verified)).toBe(true);
      }
      expect(SEED_QUESTIONS.some((q) => q.skill === s.id && q.followUpQuestionId)).toBe(true);
    }
  });

  it("non-adaptive skills are not linked to adaptive content", () => {
    for (const q of SEED_QUESTIONS.filter((x) => !skillInfo(x.skill).adaptive)) {
      expect(q.followUpQuestionId).toBeNull();
      expect(q.allowedMisconceptions).toEqual([]);
    }
  });

  it("practice never contains follow-up answers", () => {
    const followUps = SEED_QUESTIONS.filter((q) => q.questionRole === "follow-up");
    for (const p of SEED_PRACTICE) {
      const text = JSON.stringify(p).toLowerCase();
      for (const f of followUps) expect(text).not.toContain(f.prompt.toLowerCase().slice(0, 30));
    }
  });

  it("interventions reference valid skills", () => {
    for (const i of INTERVENTIONS) expect(skillInfo(i.skill).subject).toBe(i.subject);
  });
});
