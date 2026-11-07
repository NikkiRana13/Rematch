/**
 * Rule-based reasoning classifier used when no AI provider is configured (local demo)
 * and as a transparent baseline in evaluation. It is a keyword heuristic, NOT AI,
 * and is always labelled "rule-based" wherever its results appear.
 */
import type { Category } from "../types";
import type { AnalysisInput, AnalysisOutcome, ReasoningAnalyzer } from "./types";
import { validateClassification } from "./validate";

export const RULE_PROMPT_VERSION = "rules-v1";

const STOP = new Set(
  "the a an and or but so because that this then than they them their there with from into what when were was have has had will would could should about just like very also she he her his him its it's it is are be been being for not too can did does do of in on at to by as if my me i you your we our".split(
    " ",
  ),
);

const INSTRUCTION_LIKE =
  /\b(ignore (all |the |your |previous |prior )*(instructions|rules)|system prompt|you are now|mark (me|this|it) (as )?correct|give me (full |the )?points|award (me )?points|classify (this|me) as|output|respond with)\b/i;

const UNSURE =
  /^\s*(i\s*(don'?t|do not|dont)\s*know|idk|not sure|i'?m not sure|no idea|i guessed|guess(ed)?|just guessing|\?+|i dunno)[\s.!?]*$/i;

const MATH_CORRECT_CUES = [
  /\b(smaller|bigger|larger)\s+(pieces|parts|slices|bits)\b/i,
  /\b(pieces|parts|slices)\s+(are|is|were)\s+(smaller|bigger|larger)\b/i,
  /\b(halves|thirds|fourths|quarters|fifths|sixths|eighths|ninths)\s+(are|is)\s+(bigger|larger|smaller)\b/i,
  /\bfewer\s+(pieces|parts|slices)\b.*\b(bigger|larger)\b/i,
  /\b\d+\s*\/\s*\d+\s*=\s*\d+\s*\/\s*\d+/,
  /\bcut into (more|less|fewer)\b/i,
];

const LARGER_DENOMINATOR = [
  /\b(bigger|larger|greater|higher)\s+(denominator|bottom number|number on the bottom)\b(?![^.]*\b(smaller|less)\b)/i,
  /\b(denominator|bottom number)\s+(is\s+)?(bigger|larger|greater|higher)\b[^.]*\b(more|bigger|larger|greater)\s+(amount|food|pizza|ribbon|juice|space)?\b(?![^.]*\b(pieces|parts|slices)\s+(are|is)\s+smaller)/i,
  /\b(more|bigger)\s+(pieces|slices|parts)\b[^.]*\b(so|means)\b[^.]*\b(more|ate more|used more|bigger)\b/i,
  /\b(8|eight|9|nine|6|six|5|five)\s+(is|are)\s+(bigger|more|larger|greater)\s+than\s+(4|four|5|five|3|three)\b/i,
];

const SAME_NUMERATOR = [
  /\b(same|equal)\s+(numerators?|top numbers?|number on (the )?top)\b[^.]*\b(same|equal)\b/i,
  /\b(numerators?|top numbers?)\s+(are|is)\s+(the\s+)?(same|equal)\b[^.]*\b(same|equal|both)\b/i,
  /\bboth\s+(ate|eat|used|use|have|had|got|poured|planted)\s+(2|two|3|three|4|four|5|five)\b(?![^.]*\b(bigger|smaller|larger)\b)/i,
  /\b(they|both)\b[^.]*\b(same|equal)\s+(amount|much)\b(?![^.]*\b(but|bigger|smaller|larger)\b)/i,
];

const EXPLICIT_REQUIRED = [
  /\b(it|the (story|passage|text))\s+(doesn'?t|does not|dosent|dosn'?t|didn'?t|did not|never)\s+(say|says|tell|tells|state|states|mention)\b/i,
  /\b(can'?t|cannot|can not)\s+(know|tell|be sure)\b/i,
  /\bnot\s+(said|stated|written)\b/i,
];

const READING_REASONING_CUE = /\b(because|since|so|clue|the text|the passage|it says|it said)\b/i;

/** Split into clauses that are exact substrings of the original text. */
function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length >= 4 && !STOP.has(w));
}

function stem(w: string) {
  return w.replace(/(ing|ed|es|s)$/, "");
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const c of clauses(text)) {
    if (INSTRUCTION_LIKE.test(c)) continue;
    if (patterns.some((p) => p.test(c))) return c;
  }
  return null;
}

function result(
  category: Category,
  evidenceQuote: string | null,
  explanation: string,
  clarificationQuestion: string | null = null,
): { category: Category; evidenceQuote: string | null; explanation: string; needsClarification: boolean; clarificationQuestion: string | null } {
  return { category, evidenceQuote, explanation, needsClarification: Boolean(clarificationQuestion), clarificationQuestion };
}

export function classifyByRules(input: AnalysisInput) {
  const text = input.studentText;
  const meaningful = clauses(text)
    .filter((c) => !INSTRUCTION_LIKE.test(c))
    .join(" ");
  const clarify =
    input.subject === "reading"
      ? "Which words or details in the passage made you choose your answer?"
      : "Can you tell me how you compared the two amounts?";

  if (!meaningful.trim() || UNSURE.test(meaningful) || meaningful.trim().split(/\s+/).length < 3) {
    return result(
      "INSUFFICIENT_EVIDENCE",
      null,
      "Rule-based check: the explanation is missing, very short, or says the student is unsure.",
      input.isCorrect ? null : clarify,
    );
  }

  if (input.subject === "math") {
    const ld = firstMatch(text, LARGER_DENOMINATOR);
    const sn = firstMatch(text, SAME_NUMERATOR);
    const correctCue = firstMatch(text, MATH_CORRECT_CUES);
    if (ld && !correctCue)
      return result(
        "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT",
        ld,
        "Rule-based match: the explanation may treat a larger denominator as a larger amount.",
      );
    if (sn && !correctCue)
      return result(
        "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT",
        sn,
        "Rule-based match: the explanation may treat equal numerators as equal amounts.",
      );
    if (correctCue && !input.isCorrect)
      return result(
        "SLIP_WITH_CORRECT_METHOD",
        correctCue,
        "Rule-based match: the explanation describes part sizes correctly but the selected answer differs.",
      );
    if (correctCue && input.isCorrect)
      return result("NO_MISCONCEPTION_DETECTED", null, "Rule-based match: the explanation compares part sizes.");
    return result(
      "INSUFFICIENT_EVIDENCE",
      null,
      "Rule-based check: no recognised comparison reasoning was found.",
      input.isCorrect ? null : clarify,
    );
  }

  // Reading
  const passageWords = new Set(contentWords(input.passage ?? "").map(stem));
  if (!input.isCorrect) {
    const explicit = firstMatch(text, EXPLICIT_REQUIRED);
    if (explicit)
      return result(
        "EXPLICIT_STATEMENT_REQUIRED",
        explicit,
        "Rule-based match: the explanation may expect the passage to state the answer directly.",
      );
  }
  const reasoningClauses = clauses(text).filter((c) => !INSTRUCTION_LIKE.test(c));
  let bestOverlap = 0;
  let unsupported: string | null = null;
  for (const c of reasoningClauses) {
    const words = contentWords(c).map(stem);
    const overlap = words.filter((w) => passageWords.has(w)).length;
    bestOverlap = Math.max(bestOverlap, overlap);
    if (!unsupported && words.length >= 2 && overlap / words.length < 0.34 && READING_REASONING_CUE.test(c)) {
      unsupported = c;
    }
  }
  if (input.isCorrect) {
    if (bestOverlap >= 2)
      return result("NO_MISCONCEPTION_DETECTED", null, "Rule-based match: the explanation refers to passage details.");
    return result("INSUFFICIENT_EVIDENCE", null, "Rule-based check: the explanation does not clearly cite passage details.");
  }
  if (unsupported && bestOverlap < 2)
    return result(
      "UNSUPPORTED_INFERENCE",
      unsupported,
      "Rule-based match: the explanation may rely on details that do not appear in the passage.",
    );
  if (bestOverlap >= 2)
    return result(
      "INSUFFICIENT_EVIDENCE",
      null,
      "Rule-based check: the explanation cites passage details but the selected answer differs; intent is unclear.",
      clarify,
    );
  return result("INSUFFICIENT_EVIDENCE", null, "Rule-based check: no clear passage evidence was found.", clarify);
}

export class RuleBasedAnalyzer implements ReasoningAnalyzer {
  readonly provider = "rule-based";
  readonly model = null;
  readonly promptVersion = RULE_PROMPT_VERSION;
  async analyze(input: AnalysisInput): Promise<AnalysisOutcome> {
    // Rule output goes through the same validator as AI output.
    const v = validateClassification(classifyByRules(input), input.subject, input.studentText);
    if (!v.ok) return { status: "unavailable", errorCode: v.errorCode };
    return { status: "completed", value: v.value };
  }
}
