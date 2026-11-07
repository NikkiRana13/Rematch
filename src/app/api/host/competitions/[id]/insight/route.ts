import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { isAiConfigured } from "@/lib/analysis";
import { anthropicModel, callAnthropicJson } from "@/lib/analysis/anthropic";
import { generateInsight } from "@/lib/services/host";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const ai = isAiConfigured() ? { call: callAnthropicJson, model: anthropicModel() } : null;
    return { insight: await generateInsight(getDb(), await getHost(), id, ai) };
  });
}
