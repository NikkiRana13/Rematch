import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { RuleInput, updateRule } from "@/lib/services/plans";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ plan: await updateRule(getDb(), await getHost(), id, RuleInput.parse(await readJson(req))) }));
}
