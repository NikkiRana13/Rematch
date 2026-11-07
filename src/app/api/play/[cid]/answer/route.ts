import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getAnalyzer } from "@/lib/analysis";
import { getLearner } from "@/lib/auth/participant";
import { AnswerInput, submitInitialAnswer } from "@/lib/services/play";

export async function POST(req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return handle(async () => {
    const input = AnswerInput.parse(await readJson(req));
    return submitInitialAnswer(getDb(), getAnalyzer(), await getLearner(), cid, input);
  });
}
