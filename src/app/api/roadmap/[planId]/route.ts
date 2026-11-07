import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { getRoadmap } from "@/lib/services/roadmap";

export async function GET(_r: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return handle(async () => getRoadmap(getDb(), await getLearner(), planId));
}
