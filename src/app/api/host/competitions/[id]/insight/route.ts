import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { aiCaller } from "@/lib/aiCaller";
import { generateInsight } from "@/lib/services/host";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const ai = aiCaller();
    return { insight: await generateInsight(getDb(), await getHost(), id, ai) };
  });
}
