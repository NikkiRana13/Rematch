import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getAnalyzer } from "@/lib/analysis";
import { getLearner } from "@/lib/auth/participant";
import { AnswerInput } from "@/lib/services/play";
import { submitRoadmapAnswer } from "@/lib/services/roadmap";

export async function POST(req: Request, { params }: { params: Promise<{ planId: string; oid: string }> }) {
  const { planId, oid } = await params;
  return handle(async () => submitRoadmapAnswer(getDb(), getAnalyzer(), await getLearner(), planId, oid, AnswerInput.parse(await readJson(req))));
}
