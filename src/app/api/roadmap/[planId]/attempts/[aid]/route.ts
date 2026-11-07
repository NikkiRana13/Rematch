import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { roadmapAttemptState } from "@/lib/services/roadmap";

export async function GET(_r: Request, { params }: { params: Promise<{ planId: string; aid: string }> }) {
  const { planId, aid } = await params;
  return handle(async () => roadmapAttemptState(getDb(), await getLearner(), planId, aid));
}
