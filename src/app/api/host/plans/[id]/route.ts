import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { getPlanForHost, PlanMetaInput, updatePlanMeta } from "@/lib/services/plans";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => getPlanForHost(getDb(), await getHost(), id));
}
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ plan: await updatePlanMeta(getDb(), await getHost(), id, PlanMetaInput.parse(await readJson(req))) }));
}
