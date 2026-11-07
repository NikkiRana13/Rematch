import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { listRoadmaps } from "@/lib/services/roadmap";

export async function GET() {
  return handle(async () => listRoadmaps(getDb(), await getLearner()));
}
