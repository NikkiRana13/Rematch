import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { overrideClassification, OverrideInput } from "@/lib/services/host";

export async function POST(req: Request, { params }: { params: Promise<{ aid: string }> }) {
  const { aid } = await params;
  return handle(async () => {
    const host = await getHost();
    return { override: await overrideClassification(getDb(), host, aid, OverrideInput.parse(await readJson(req))) };
  });
}
