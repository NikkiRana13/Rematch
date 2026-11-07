import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { completePractice } from "@/lib/services/play";

export async function POST(_req: Request, { params }: { params: Promise<{ cid: string; aid: string }> }) {
  const { cid, aid } = await params;
  return handle(async () => completePractice(getDb(), await getLearner(), cid, aid));
}
