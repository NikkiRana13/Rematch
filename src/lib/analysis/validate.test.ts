import { describe, expect, it } from "vitest";
import { classificationJsonSchema, quoteOccursIn, validateClassification } from "./validate";

const text = "Noah ate more because 8 is bigger than 4.";
const ok = {
  category: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT",
  evidenceQuote: "8 is bigger than 4",
  explanation: "The student likely treats a larger denominator as a larger amount.",
  needsClarification: false,
  clarificationQuestion: null,
};

describe("classification validation", () => {
  it("accepts a valid specific classification with a verbatim quote", () => {
    const r = validateClassification(ok, "math", text);
    expect(r.ok).toBe(true);
  });

  it("rejects categories from the other subject's taxonomy", () => {
    expect(validateClassification({ ...ok, category: "UNSUPPORTED_INFERENCE" }, "math", text)).toEqual({
      ok: false,
      errorCode: "category_not_in_taxonomy",
    });
  });

  it("rejects unknown categories and wrong field types", () => {
    expect(validateClassification({ ...ok, category: "MADE_UP" }, "math", text).ok).toBe(false);
    expect(validateClassification({ ...ok, needsClarification: "no" }, "math", text)).toEqual({ ok: false, errorCode: "schema_invalid" });
    expect(validateClassification({ ...ok, extra: 1 }, "math", text)).toEqual({ ok: false, errorCode: "schema_invalid" });
    expect(validateClassification(null, "math", text).ok).toBe(false);
  });

  it("requires an evidence quote for specific categories", () => {
    expect(validateClassification({ ...ok, evidenceQuote: null }, "math", text)).toEqual({ ok: false, errorCode: "missing_required_evidence" });
    expect(validateClassification({ ...ok, evidenceQuote: "  " }, "math", text)).toEqual({ ok: false, errorCode: "missing_required_evidence" });
  });

  it("rejects quotes that are not in the student's reasoning (fabricated or paraphrased)", () => {
    expect(validateClassification({ ...ok, evidenceQuote: "bigger denominators are bigger" }, "math", text)).toEqual({
      ok: false,
      errorCode: "evidence_quote_not_in_reasoning",
    });
  });

  it("tolerates whitespace, case and curly quote differences only", () => {
    expect(quoteOccursIn("It doesn’t say", "it doesn't   say why")).toBe(true);
    expect(quoteOccursIn("doesnt say", "it doesn't say")).toBe(false);
  });

  it("allows null evidence for insufficient evidence and requires a clarification question when needed", () => {
    const base = { category: "INSUFFICIENT_EVIDENCE", evidenceQuote: null, explanation: "Unclear.", needsClarification: true };
    expect(validateClassification({ ...base, clarificationQuestion: "Which clue helped?" }, "reading", "idk").ok).toBe(true);
    expect(validateClassification({ ...base, clarificationQuestion: null }, "reading", "idk")).toEqual({
      ok: false,
      errorCode: "clarification_question_missing",
    });
  });

  it("JSON schema enumerates only the subject's categories", () => {
    const s = classificationJsonSchema("reading");
    expect(s.properties.category.enum).toContain("UNSUPPORTED_INFERENCE");
    expect(s.properties.category.enum).not.toContain("SAME_NUMERATOR_MEANS_EQUAL_AMOUNT");
  });
});
