import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { getPlayState } from "@/lib/services/play";

export async function GET(_req: Request, { params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params;
  return handle(async () => getPlayState(getDb(), await getLearner(), cid));
}
