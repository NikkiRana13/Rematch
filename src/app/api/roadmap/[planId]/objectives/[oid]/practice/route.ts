import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { objectivePractice } from "@/lib/services/roadmap";

export async function GET(_r: Request, { params }: { params: Promise<{ planId: string; oid: string }> }) {
  const { planId, oid } = await params;
  return handle(async () => objectivePractice(getDb(), await getLearner(), planId, oid));
}
