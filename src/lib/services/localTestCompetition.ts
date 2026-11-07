/**
 * LOCAL DEMO ONLY: one hardcoded, always-open competition for manual testing.
 * It is added to the local file store (never to Supabase/production) with a fixed
 * room code, id and question list, so URLs and steps are the same on every run.
 */
import type { Store } from "../db/memory";
import type { Competition } from "../types";

export const LOCAL_TEST_CODE = "123456";
export const LOCAL_TEST_COMPETITION_ID = "00000000-0000-4000-8000-000000007e57";

/** Pizza and juice are adaptive (targeted practice + comeback); place value is not. */
export const LOCAL_TEST_QUESTION_IDS = ["q-math-frac-pizza", "q-math-frac-juice", "q-math-place-value"];

export function localTestCompetition(): Competition {
  return {
    id: LOCAL_TEST_COMPETITION_ID,
    ownerId: "demo-teacher",
    title: "Local Test Sprint (123456)",
    description: "Hardcoded local-only competition for testing. Reset demo data to clear its answers.",
    subject: "math",
    gradeLevel: 5,
    status: "open",
    roomCode: LOCAL_TEST_CODE,
    questionIds: LOCAL_TEST_QUESTION_IDS,
    isDemoData: false,
    isPracticeSpace: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    openedAt: "2026-01-01T00:00:00.000Z",
    closedAt: null,
  };
}

/**
 * Ensures the test competition exists, is open, and has its fixed questions.
 * Also assigns the demo learning plans to it so "My roadmap" works after joining.
 * Returns true when the store changed.
 */
export function ensureLocalTestCompetition(store: Store): boolean {
  let changed = false;
  const fixed = localTestCompetition();
  const existing = store.competitions.find((c) => c.id === fixed.id);
  if (!existing) {
    // Free the code if anything else happened to take it.
    for (const c of store.competitions) if (c.roomCode === LOCAL_TEST_CODE) c.roomCode = `${LOCAL_TEST_CODE}X`;
    store.competitions.push(fixed);
    changed = true;
  } else if (existing.status !== "open" || existing.roomCode !== LOCAL_TEST_CODE || existing.questionIds.join() !== fixed.questionIds.join()) {
    Object.assign(existing, { status: "open", roomCode: LOCAL_TEST_CODE, questionIds: fixed.questionIds, closedAt: null });
    changed = true;
  }
  for (const plan of store.learning_plans.filter((p) => p.ownerId === "demo-teacher" && p.isDemoData)) {
    if (!store.learning_plan_assignments.some((a) => a.planId === plan.id && a.competitionId === fixed.id)) {
      store.learning_plan_assignments.push({ id: `local-test-assign-${plan.id}`, planId: plan.id, competitionId: fixed.id, createdAt: fixed.createdAt });
      changed = true;
    }
  }
  return changed;
}
