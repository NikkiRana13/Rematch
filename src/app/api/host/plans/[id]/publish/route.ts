import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { publishPlan } from "@/lib/services/plans";

export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ plan: await publishPlan(getDb(), await getHost(), id) }));
}
