import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { createPlan, listPlans, PlanMetaInput } from "@/lib/services/plans";

export async function GET() {
  return handle(async () => ({ plans: await listPlans(getDb(), await getHost()) }));
}
export async function POST(req: Request) {
  return handle(async () => ({ plan: await createPlan(getDb(), await getHost(), PlanMetaInput.parse(await readJson(req))) }));
}
