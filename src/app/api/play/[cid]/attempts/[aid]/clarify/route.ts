import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getAnalyzer } from "@/lib/analysis";
import { getLearner } from "@/lib/auth/participant";
import { ClarifyInput, submitClarification } from "@/lib/services/play";

export async function POST(req: Request, { params }: { params: Promise<{ cid: string; aid: string }> }) {
  const { cid, aid } = await params;
  return handle(async () => {
    const input = ClarifyInput.parse(await readJson(req));
    return submitClarification(getDb(), getAnalyzer(), await getLearner(), cid, aid, input);
  });
}
