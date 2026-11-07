import { SEED_PASSAGES, SEED_PRACTICE, SEED_QUESTIONS } from "../content/seed";
import { emptyStore, type Store } from "../db/memory";
import type { Host } from "../types";
import { buildDemoBundle } from "./demoData";

/** Fictional demo host accounts (local demo mode only). */
export const DEMO_HOSTS: Host[] = [
  { id: "demo-teacher", displayName: "Ms. Rivera (fictional demo teacher)", hostRole: "teacher", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "demo-student-host", displayName: "Jordan (fictional demo student host)", hostRole: "student", createdAt: "2026-01-01T00:00:00.000Z" },
];

export function seedLocalStore(): Store {
  const store = emptyStore();
  store.passages.push(...structuredClone(SEED_PASSAGES));
  store.questions.push(...structuredClone(SEED_QUESTIONS));
  store.practice_resources.push(...structuredClone(SEED_PRACTICE));
  store.hosts.push(...structuredClone(DEMO_HOSTS));
  const bundle = buildDemoBundle("demo-teacher", new Set());
  store.competitions.push(...bundle.competitions);
  store.participants.push(...bundle.participants);
  store.attempts.push(...bundle.attempts);
  store.analyses.push(...bundle.analyses);
  return store;
}
