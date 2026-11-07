import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { OverrideInput, overrideObjective } from "@/lib/services/plans";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ override: await overrideObjective(getDb(), await getHost(), id, OverrideInput.parse(await readJson(req))) }));
}
