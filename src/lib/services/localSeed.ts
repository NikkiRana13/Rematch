import { SEED_PASSAGES, SEED_PRACTICE, SEED_QUESTIONS } from "../content/seed";
import { emptyStore, type Store } from "../db/memory";
import type { Host } from "../types";
import { buildDemoBundle } from "./demoData";
import { buildDemoPlans } from "./demoPlans";

/** Fictional demo host accounts (local demo mode only). */
export const DEMO_HOSTS: Host[] = [
  { id: "demo-teacher", displayName: "Ms. Rivera (fictional demo teacher)", hostRole: "teacher", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "demo-teacher-2", displayName: "Mr. Okafor (fictional demo teacher)", hostRole: "teacher", createdAt: "2026-01-01T00:00:00.000Z" },
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
  // Demo learning plans, assigned to the demo roadmap class and the open math sprint.
  const taken = new Set(store.competitions.map((c) => c.roomCode));
  const liveMath = bundle.competitions.find((c) => c.status === "open" && c.subject === "math");
  const plans = buildDemoPlans("demo-teacher", taken, liveMath ? [liveMath.id] : []);
  store.competitions.push(...plans.competitions);
  store.learning_plans.push(...plans.plans);
  store.learning_plan_lectures.push(...plans.lectures);
  store.learning_objectives.push(...plans.objectives);
  store.objective_question_mappings.push(...plans.mappings);
  store.learning_plan_assignments.push(...plans.assignments);
  store.learners.push(...plans.learners);
  store.participants.push(...plans.participants);
  store.attempts.push(...plans.attempts);
  store.analyses.push(...plans.analyses);
  return store;
}
