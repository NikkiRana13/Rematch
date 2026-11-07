// Core domain types shared by server code, tests, and (in sanitized form) the UI.

export type Subject = "reading" | "math";

export type SkillId =
  | "reading.main_idea"
  | "reading.inference"
  | "reading.vocabulary_in_context"
  | "reading.supporting_evidence"
  | "math.place_value"
  | "math.addition_subtraction"
  | "math.multiplication_division"
  | "math.fractions_intro";

export type ReadingMisconception = "UNSUPPORTED_INFERENCE" | "EXPLICIT_STATEMENT_REQUIRED";
export type MathMisconception =
  | "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT"
  | "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT";
export type SharedCategory =
  | "SLIP_WITH_CORRECT_METHOD"
  | "OTHER_MISCONCEPTION"
  | "INSUFFICIENT_EVIDENCE"
  | "NO_MISCONCEPTION_DETECTED";
export type MisconceptionCode = ReadingMisconception | MathMisconception;
export type Category = MisconceptionCode | SharedCategory;

export type QuestionRole = "initial" | "follow-up";
export type CompetitionStatus = "draft" | "open" | "closed";
export type HostRole = "teacher" | "student";

export interface AnswerChoice {
  /** Stable choice id. Seeded content uses letters that match display order. */
  id: string;
  text: string;
}

export interface Passage {
  id: string;
  subject: Subject;
  gradeLevel: number;
  title: string;
  body: string;
  ownerId: string | null;
  source: "seed" | "manual";
  createdAt: string;
}

export interface Question {
  id: string;
  version: number;
  subject: Subject;
  gradeLevel: number;
  skill: SkillId;
  /** Short human description of the precise concept, e.g. "Comparing fractions with the same numerator". */
  skillFocus: string;
  questionRole: QuestionRole;
  passageId: string | null;
  prompt: string;
  reasoningPrompt: string;
  answerChoices: AnswerChoice[];
  correctAnswer: string;
  referenceExplanation: string;
  allowedMisconceptions: MisconceptionCode[];
  practiceResourceId: string | null;
  followUpQuestionId: string | null;
  /** Host (or seed author) confirmed the answer key. Unverified questions cannot be launched. */
  verified: boolean;
  ownerId: string | null;
  source: "seed" | "manual";
  createdAt: string;
}

export interface FractionBar {
  label: string;
  numerator: number;
  denominator: number;
}

export interface PracticeResource {
  id: string;
  subject: Subject;
  skill: SkillId;
  kind: "targeted" | "general" | "slip";
  misconception: MisconceptionCode | null;
  title: string;
  explanation: string[];
  workedExample: {
    passage?: string;
    problem?: string;
    steps: string[];
    fractionBars?: FractionBar[];
  };
  verified: boolean;
}

export interface Intervention {
  id: string;
  subject: Subject;
  skill: SkillId;
  title: string;
  description: string;
  steps: string[];
  targets: Category[];
  durationMinutes: number;
}

export interface Host {
  id: string;
  displayName: string;
  hostRole: HostRole;
  createdAt: string;
}

export interface Competition {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  subject: Subject;
  gradeLevel: number;
  status: CompetitionStatus;
  roomCode: string;
  questionIds: string[];
  isDemoData: boolean;
  /** Hidden per-plan competition used for roadmap rematches; never listed as a sprint. */
  isPracticeSpace: boolean;
  createdAt: string;
  openedAt: string | null;
  closedAt: string | null;
}

export interface Learner {
  id: string;
  tokenHash: string;
  nickname: string;
  /** SHA-256 of the learner's private resume code (lets them continue on another device). */
  resumeCodeHash: string | null;
  isSynthetic: boolean;
  createdAt: string;
}

/** Additional device sessions for a learner (created by entering a resume code). */
export interface LearnerSession {
  id: string;
  learnerId: string;
  tokenHash: string;
  createdAt: string;
}

export interface Participant {
  id: string;
  competitionId: string;
  /** null for synthetic demonstration participants. */
  learnerId: string | null;
  nickname: string;
  isSynthetic: boolean;
  joinedAt: string;
}

export type ReasoningStatus = "provided" | "not_sure" | "skipped";
export type ClarificationStatus = "none" | "requested" | "answered" | "declined";

export type RoutePath =
  | "continue"
  | "clarify"
  | "targeted_practice"
  | "general_practice"
  | "slip_review"
  | "optional_targeted_practice";

export interface Route {
  path: RoutePath;
  practiceResourceId: string | null;
  comebackQuestionId: string | null;
  teacherReview: boolean;
  reason: string;
  /** True only when verified targeted practice AND a verified follow-up exist. */
  adaptiveSupport: boolean;
}

export interface Attempt {
  id: string;
  participantId: string;
  competitionId: string;
  questionId: string;
  questionVersion: number;
  subject: Subject;
  skill: SkillId;
  /** initial = competition question; comeback = follow-up after practice; roadmap = objective rematch (no points). */
  kind: "initial" | "comeback" | "roadmap";
  originalAttemptId: string | null;
  selectedAnswer: string;
  isCorrect: boolean;
  points: number;
  reasoning: string;
  reasoningStatus: ReasoningStatus;
  readAloudUsed: boolean;
  route: Route | null;
  clarificationStatus: ClarificationStatus;
  clarificationText: string | null;
  practiceCompletedAt: string | null;
  teacherReview: boolean;
  /** False when the learner had already seen this question (and its answer) before. */
  independent: boolean;
  support: "none" | "answer_previously_revealed";
  /** Objective targeted by a roadmap rematch (informational; evidence uses explicit mappings). */
  objectiveId: string | null;
  isSynthetic: boolean;
  createdAt: string;
}

export interface Analysis {
  id: string;
  attemptId: string;
  stage: "initial" | "clarification";
  status: "completed" | "unavailable";
  provider: string;
  model: string | null;
  promptVersion: string;
  category: Category | null;
  evidenceQuote: string | null;
  explanation: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  errorCode: string | null;
  isSynthetic: boolean;
  createdAt: string;
}

export interface ClassificationOverride {
  id: string;
  analysisId: string;
  attemptId: string;
  hostId: string;
  category: Category;
  note: string;
  createdAt: string;
}

export interface Insight {
  id: string;
  competitionId: string;
  hostId: string;
  provider: string;
  model: string | null;
  promptVersion: string;
  status: "completed" | "unavailable";
  payload: InsightPayload;
  createdAt: string;
}

export interface InsightPayload {
  source: "ai" | "rule-based";
  summary: string;
  observations: { text: string; evidenceIds: string[] }[];
  suggestions: { interventionId: string; whyItMayFit: string }[];
  caveats: string[];
  errorCode?: string | null;
}

export interface InterventionAssignment {
  id: string;
  competitionId: string;
  hostId: string;
  interventionId: string;
  rationale: string;
  source: "ai" | "rule-based";
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Learning plans & roadmap
// ---------------------------------------------------------------------------

export type ObjectiveStatus = "not_assessed" | "in_progress" | "needs_practice" | "demonstrated";

/** MVP "Demonstrated in Rematch" rule. Configurable within a small set of options. */
export interface EvidenceRule {
  /** Distinct mapped questions needed before a decision (also the size of the "recent" window). */
  minDistinctQuestions: 2 | 3 | 4;
  /** Correct answers required among the most recent `minDistinctQuestions` distinct questions. */
  minCorrectInRecent: number;
  requireLatestCorrect: boolean;
  requireTransferCorrect: boolean;
}

export interface LearningPlan {
  id: string;
  ownerId: string;
  title: string;
  subject: Subject | "mixed";
  courseLabel: string;
  description: string;
  /** "Lecture" or "Lesson" (configurable label). */
  unitLabel: "Lecture" | "Lesson";
  status: "draft" | "published";
  publishedVersion: number | null;
  /** Version currently being edited (null when no draft exists). */
  draftVersion: number | null;
  evidenceRule: EvidenceRule;
  source: "manual" | "import";
  practiceCompetitionId: string | null;
  isDemoData: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanLecture {
  id: string;
  planId: string;
  planVersion: number;
  position: number;
  number: number;
  title: string;
}

export interface LearningObjective {
  id: string;
  planId: string;
  planVersion: number;
  lectureId: string;
  /** Stable across plan versions. */
  objectiveKey: string;
  position: number;
  text: string;
  skill: SkillId | null;
  required: boolean;
  /** Set by import when an objective is ambiguous or too broad; must be resolved before publishing. */
  needsReview: boolean;
  reviewNote: string | null;
  sourceQuote: string | null;
}

export interface ObjectiveQuestionMapping {
  id: string;
  objectiveId: string;
  planId: string;
  planVersion: number;
  questionId: string;
}

export interface PlanAssignment {
  id: string;
  planId: string;
  competitionId: string;
  createdAt: string;
}

export interface ObjectiveOverride {
  id: string;
  planId: string;
  objectiveId: string;
  learnerId: string;
  hostId: string;
  status: ObjectiveStatus;
  reason: string;
  computedStatusAtOverride: ObjectiveStatus;
  createdAt: string;
}
