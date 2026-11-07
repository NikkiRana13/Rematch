import type {
  Analysis,
  Attempt,
  ClassificationOverride,
  Competition,
  Host,
  Insight,
  InterventionAssignment,
  Learner,
  LearnerSession,
  LearningObjective,
  LearningPlan,
  ObjectiveOverride,
  ObjectiveQuestionMapping,
  Participant,
  PlanAssignment,
  PlanLecture,
  Passage,
  PracticeResource,
  Question,
} from "../types";

export interface RowMap {
  hosts: Host;
  passages: Passage;
  questions: Question;
  practice_resources: PracticeResource;
  competitions: Competition;
  learners: Learner;
  participants: Participant;
  attempts: Attempt;
  analyses: Analysis;
  classification_overrides: ClassificationOverride;
  insights: Insight;
  intervention_assignments: InterventionAssignment;
  learner_sessions: LearnerSession;
  learning_plans: LearningPlan;
  learning_plan_lectures: PlanLecture;
  learning_objectives: LearningObjective;
  objective_question_mappings: ObjectiveQuestionMapping;
  learning_plan_assignments: PlanAssignment;
  objective_progress_overrides: ObjectiveOverride;
}
export type TableName = keyof RowMap;

export interface SelectOptions<R> {
  eq?: Partial<R>;
  in?: { column: keyof R & string; values: (string | number)[] };
  orderBy?: { column: keyof R & string; ascending?: boolean };
  limit?: number;
}

export class UniqueViolationError extends Error {
  constructor(public table: string) {
    super(`Duplicate record in ${table}`);
  }
}

export class DbUnavailableError extends Error {
  constructor(message = "The database is unavailable.") {
    super(message);
  }
}

/** Minimal storage interface used by all server-side services. */
export interface Db {
  readonly mode: "supabase" | "local";
  select<T extends TableName>(table: T, opts?: SelectOptions<RowMap[T]>): Promise<RowMap[T][]>;
  insert<T extends TableName>(table: T, row: RowMap[T]): Promise<RowMap[T]>;
  /** Updates rows matching ALL `where` fields; returns updated rows (use for compare-and-set). */
  update<T extends TableName>(table: T, where: Partial<RowMap[T]>, patch: Partial<RowMap[T]>): Promise<RowMap[T][]>;
  /** Deletes rows matching ALL `where` fields (an empty `where` is refused). */
  delete<T extends TableName>(table: T, where: Partial<RowMap[T]>): Promise<number>;
}
