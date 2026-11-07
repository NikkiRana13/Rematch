import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { aiCaller } from "@/lib/aiCaller";
import { importPlan, PlanMetaInput } from "@/lib/services/plans";

const Input = z.object({ filename: z.string().max(200), text: z.string().max(200_000), meta: PlanMetaInput });

export async function POST(req: Request) {
  return handle(async () => {
    const host = await getHost();
    return importPlan(getDb(), host, Input.parse(await readJson(req)), aiCaller());
  });
}
