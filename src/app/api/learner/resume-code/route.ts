import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { issueResumeCode } from "@/lib/services/learnerAccess";

/** Issues a new private resume code for the signed-in learner (shown once). */
export async function POST() {
  return handle(async () => ({ code: await issueResumeCode(getDb(), await getLearner()) }));
}
