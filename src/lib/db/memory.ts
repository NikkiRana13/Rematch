import type { Db, RowMap, SelectOptions, TableName } from "./types";
import { UniqueViolationError } from "./types";

export type Store = { [K in TableName]: RowMap[K][] };

export function emptyStore(): Store {
  return {
    hosts: [],
    passages: [],
    questions: [],
    practice_resources: [],
    competitions: [],
    learners: [],
    participants: [],
    attempts: [],
    analyses: [],
    classification_overrides: [],
    insights: [],
    intervention_assignments: [],
    learner_sessions: [],
    learning_plans: [],
    learning_plan_lectures: [],
    learning_objectives: [],
    objective_question_mappings: [],
    learning_plan_assignments: [],
    objective_progress_overrides: [],
  };
}

/** Unique constraints mirrored from the SQL migration (including partial indexes on attempts). */
const UNIQUE: { [K in TableName]?: ((r: RowMap[K]) => string | null)[] } = {
  competitions: [(r) => r.roomCode],
  learners: [(r) => r.tokenHash],
  participants: [(r) => (r.learnerId ? `${r.competitionId}:${r.learnerId}` : null)],
  attempts: [
    (r) => (r.kind === "initial" ? `${r.participantId}:${r.questionId}` : null),
    (r) => (r.kind === "comeback" ? `${r.originalAttemptId}` : null),
  ],
  analyses: [(r) => `${r.attemptId}:${r.stage}`],
  learner_sessions: [(r) => r.tokenHash],
  objective_question_mappings: [(r) => `${r.objectiveId}:${r.questionId}`],
  learning_plan_assignments: [(r) => `${r.planId}:${r.competitionId}`],
};

const field = (row: unknown, k: string): unknown => (row as Record<string, unknown>)[k];

function matches<R>(row: R, eq?: Partial<R>): boolean {
  if (!eq) return true;
  return Object.entries(eq).every(([k, v]) => field(row, k) === v);
}

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Db. Used directly in tests and wrapped with file persistence for local demo mode. */
export class MemoryDb implements Db {
  readonly mode = "local" as const;
  constructor(
    public store: Store = emptyStore(),
    private onChange: () => void = () => {},
  ) {}

  async select<T extends TableName>(table: T, opts: SelectOptions<RowMap[T]> = {}): Promise<RowMap[T][]> {
    let rows = (this.store[table] as RowMap[T][]).filter((r) => matches(r, opts.eq));
    if (opts.in) {
      const { column, values } = opts.in;
      rows = rows.filter((r) => values.includes(field(r, column) as string));
    }
    if (opts.orderBy) {
      const { column, ascending = true } = opts.orderBy;
      rows = [...rows].sort((a, b) => {
        const av = field(a, column) as string;
        const bv = field(b, column) as string;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (opts.limit !== undefined) rows = rows.slice(0, opts.limit);
    return clone(rows);
  }

  async insert<T extends TableName>(table: T, row: RowMap[T]): Promise<RowMap[T]> {
    const rows = this.store[table] as RowMap[T][];
    const id = (row as { id?: string }).id;
    if (id && rows.some((r) => (r as { id?: string }).id === id)) throw new UniqueViolationError(table);
    for (const key of (UNIQUE[table] ?? []) as ((r: RowMap[T]) => string | null)[]) {
      const k = key(row);
      if (k !== null && rows.some((r) => key(r) === k)) throw new UniqueViolationError(table);
    }
    rows.push(clone(row));
    this.onChange();
    return clone(row);
  }

  async update<T extends TableName>(table: T, where: Partial<RowMap[T]>, patch: Partial<RowMap[T]>): Promise<RowMap[T][]> {
    const rows = this.store[table] as RowMap[T][];
    const updated: RowMap[T][] = [];
    for (let i = 0; i < rows.length; i++) {
      if (matches(rows[i], where)) {
        rows[i] = { ...rows[i], ...clone(patch) };
        updated.push(clone(rows[i]));
      }
    }
    if (updated.length) this.onChange();
    return updated;
  }

  async delete<T extends TableName>(table: T, where: Partial<RowMap[T]>): Promise<number> {
    if (!Object.keys(where).length) throw new Error("Refusing to delete without a filter");
    const rows = this.store[table] as RowMap[T][];
    const keep = rows.filter((r) => !matches(r, where));
    const removed = rows.length - keep.length;
    (this.store[table] as RowMap[T][]) = keep;
    if (removed) this.onChange();
    return removed;
  }
}
