import type { Category, MisconceptionCode, SharedCategory, SkillId, Subject } from "../types";

export interface SkillInfo {
  id: SkillId;
  subject: Subject;
  label: string;
  /** Whether verified targeted practice + follow-up content exists for this skill in the seed bank. */
  adaptive: boolean;
  adaptiveFocus: string | null;
}

export const SKILLS: SkillInfo[] = [
  { id: "reading.main_idea", subject: "reading", label: "Main idea", adaptive: false, adaptiveFocus: null },
  {
    id: "reading.inference",
    subject: "reading",
    label: "Inference",
    adaptive: true,
    adaptiveFocus: "Making inferences using textual evidence",
  },
  {
    id: "reading.vocabulary_in_context",
    subject: "reading",
    label: "Vocabulary in context",
    adaptive: false,
    adaptiveFocus: null,
  },
  {
    id: "reading.supporting_evidence",
    subject: "reading",
    label: "Supporting evidence",
    adaptive: false,
    adaptiveFocus: null,
  },
  { id: "math.place_value", subject: "math", label: "Place value", adaptive: false, adaptiveFocus: null },
  {
    id: "math.addition_subtraction",
    subject: "math",
    label: "Addition and subtraction",
    adaptive: false,
    adaptiveFocus: null,
  },
  {
    id: "math.multiplication_division",
    subject: "math",
    label: "Multiplication and division",
    adaptive: false,
    adaptiveFocus: null,
  },
  {
    id: "math.fractions_intro",
    subject: "math",
    label: "Introductory fractions",
    adaptive: true,
    adaptiveFocus: "Comparing fractions with the same numerator",
  },
];

export const SUBJECT_LABEL: Record<Subject, string> = { reading: "Reading comprehension", math: "Math" };

export function skillInfo(id: SkillId): SkillInfo {
  const s = SKILLS.find((k) => k.id === id);
  if (!s) throw new Error(`Unknown skill ${id}`);
  return s;
}

export function isSkillId(v: unknown): v is SkillId {
  return typeof v === "string" && SKILLS.some((s) => s.id === v);
}

export interface CategoryInfo {
  code: Category;
  label: string;
  /** Plain-language label for students. Never used to label the student, only the idea. */
  studentLabel: string;
  definition: string;
  /** Specific categories require a verbatim supporting excerpt from the student's reasoning. */
  requiresEvidence: boolean;
}

export const READING_CATEGORIES: CategoryInfo[] = [
  {
    code: "UNSUPPORTED_INFERENCE",
    label: "Unsupported inference",
    studentLabel: "using an idea the passage doesn't support",
    definition:
      "Student explicitly bases a conclusion on an invented detail or outside assumption that the passage does not support.",
    requiresEvidence: true,
  },
  {
    code: "EXPLICIT_STATEMENT_REQUIRED",
    label: "Expects the answer to be stated directly",
    studentLabel: "waiting for the passage to say the answer directly",
    definition:
      "Student explicitly says an inference cannot be made because the passage does not directly state the answer, despite supporting clues.",
    requiresEvidence: true,
  },
];

export const MATH_CATEGORIES: CategoryInfo[] = [
  {
    code: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT",
    label: "Larger denominator means larger amount",
    studentLabel: "thinking a bigger bottom number means a bigger amount",
    definition:
      "Student explicitly argues that a larger denominator makes the fraction larger when comparing the same numerator and equal wholes.",
    requiresEvidence: true,
  },
  {
    code: "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT",
    label: "Same numerator means equal amount",
    studentLabel: "thinking the same top number means the same amount",
    definition:
      "Student explicitly argues that equal numerators make fractions equal, ignoring different part sizes.",
    requiresEvidence: true,
  },
];

export const SHARED_CATEGORIES: CategoryInfo[] = [
  {
    code: "SLIP_WITH_CORRECT_METHOD",
    label: "Slip with correct method",
    studentLabel: "a small slip even though your thinking was on track",
    definition:
      "Reasoning demonstrates the correct method but contains a local calculation, copying, or answer-selection error.",
    requiresEvidence: true,
  },
  {
    code: "OTHER_MISCONCEPTION",
    label: "Other misconception",
    studentLabel: "a different idea worth talking through",
    definition: "Clear incorrect reasoning outside the supported taxonomy.",
    requiresEvidence: true,
  },
  {
    code: "INSUFFICIENT_EVIDENCE",
    label: "Insufficient evidence",
    studentLabel: "not enough explanation to tell",
    definition:
      "Missing, vague, contradictory reasoning, an unexplained guess, or multiple conflicting interpretations.",
    requiresEvidence: false,
  },
  {
    code: "NO_MISCONCEPTION_DETECTED",
    label: "No misconception detected",
    studentLabel: "reasoning that supports the answer",
    definition: "Reasoning supports the correct method or a defensible text-based answer.",
    requiresEvidence: false,
  },
];

export function categoriesForSubject(subject: Subject): CategoryInfo[] {
  return [...(subject === "reading" ? READING_CATEGORIES : MATH_CATEGORIES), ...SHARED_CATEGORIES];
}

export const ALL_CATEGORIES: CategoryInfo[] = [...READING_CATEGORIES, ...MATH_CATEGORIES, ...SHARED_CATEGORIES];

export function categoryInfo(code: Category): CategoryInfo {
  const c = ALL_CATEGORIES.find((k) => k.code === code);
  if (!c) throw new Error(`Unknown category ${code}`);
  return c;
}

export function isCategoryForSubject(code: unknown, subject: Subject): code is Category {
  return typeof code === "string" && categoriesForSubject(subject).some((c) => c.code === code);
}

export const SUBJECT_MISCONCEPTIONS: Record<Subject, MisconceptionCode[]> = {
  reading: ["UNSUPPORTED_INFERENCE", "EXPLICIT_STATEMENT_REQUIRED"],
  math: ["LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT"],
};

export function isMisconceptionCode(c: Category | null | undefined): c is MisconceptionCode {
  return (
    c === "UNSUPPORTED_INFERENCE" ||
    c === "EXPLICIT_STATEMENT_REQUIRED" ||
    c === "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT" ||
    c === "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT"
  );
}

/** Categories that point to a specific (likely) reasoning issue. */
export function isSpecificCategory(c: Category | null | undefined): boolean {
  return isMisconceptionCode(c) || c === "OTHER_MISCONCEPTION" || c === "SLIP_WITH_CORRECT_METHOD";
}

export const SHARED_CODES: SharedCategory[] = SHARED_CATEGORIES.map((c) => c.code as SharedCategory);
