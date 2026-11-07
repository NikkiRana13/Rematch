import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { isAiConfigured } from "@/lib/analysis";
import { getHostResults } from "@/lib/services/host";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ ...(await getHostResults(getDb(), await getHost(), id)), aiConfigured: isAiConfigured() }));
}
