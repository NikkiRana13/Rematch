import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { assignPlan } from "@/lib/services/plans";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const { competitionIds } = z.object({ competitionIds: z.array(z.string()).max(50) }).parse(await readJson(req));
    return assignPlan(getDb(), await getHost(), id, competitionIds);
  });
}
