import { z } from "zod";
import { categoriesForSubject, categoryInfo, isCategoryForSubject } from "../content/taxonomy";
import type { Category, Subject } from "../types";

/** Raw model output shape. Field types are validated here; membership is validated below. */
export const RawClassificationSchema = z
  .object({
    category: z.string(),
    evidenceQuote: z.string().nullable(),
    explanation: z.string(),
    needsClarification: z.boolean(),
    clarificationQuestion: z.string().nullable(),
  })
  .strict();

export interface Classification {
  category: Category;
  evidenceQuote: string | null;
  explanation: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

export type ValidationResult = { ok: true; value: Classification } | { ok: false; errorCode: string };

/** JSON schema sent to the model as the structured-output format. */
export function classificationJsonSchema(subject: Subject) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["category", "evidenceQuote", "explanation", "needsClarification", "clarificationQuestion"],
    properties: {
      category: { type: "string", enum: categoriesForSubject(subject).map((c) => c.code) },
      evidenceQuote: { anyOf: [{ type: "string" }, { type: "null" }] },
      explanation: { type: "string" },
      needsClarification: { type: "boolean" },
      clarificationQuestion: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  };
}

export function normalizeForQuoteMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The quote must appear verbatim (modulo whitespace, case and curly quotes) in the student's own text. */
export function quoteOccursIn(quote: string, studentText: string): boolean {
  const q = normalizeForQuoteMatch(quote);
  if (q.length < 2) return false;
  return normalizeForQuoteMatch(studentText).includes(q);
}

/**
 * Validates provider output. Anything invalid becomes an error code so the caller
 * stores "analysis unavailable" rather than a fabricated or unsupported result.
 */
export function validateClassification(raw: unknown, subject: Subject, studentText: string): ValidationResult {
  const parsed = RawClassificationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errorCode: "schema_invalid" };
  const v = parsed.data;
  if (!isCategoryForSubject(v.category, subject)) return { ok: false, errorCode: "category_not_in_taxonomy" };
  const category = v.category as Category;
  const info = categoryInfo(category);

  let evidenceQuote = v.evidenceQuote;
  if (evidenceQuote !== null && evidenceQuote.trim() === "") evidenceQuote = null;

  if (info.requiresEvidence && evidenceQuote === null) return { ok: false, errorCode: "missing_required_evidence" };
  if (evidenceQuote !== null && !quoteOccursIn(evidenceQuote, studentText)) {
    return { ok: false, errorCode: "evidence_quote_not_in_reasoning" };
  }
  if (v.needsClarification && !v.clarificationQuestion?.trim()) {
    return { ok: false, errorCode: "clarification_question_missing" };
  }
  if (!v.explanation.trim()) return { ok: false, errorCode: "explanation_missing" };

  return {
    ok: true,
    value: {
      category,
      evidenceQuote,
      explanation: v.explanation.trim().slice(0, 1000),
      needsClarification: v.needsClarification,
      clarificationQuestion: v.needsClarification ? (v.clarificationQuestion?.trim().slice(0, 300) ?? null) : null,
    },
  };
}
