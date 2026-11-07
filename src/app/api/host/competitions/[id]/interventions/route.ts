import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { assignIntervention } from "@/lib/services/host";

/** Teacher-reviewed assignment of a curated activity. Never automatic. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const host = await getHost();
    const input = z
      .object({ interventionId: z.string(), rationale: z.string().max(500).default(""), source: z.enum(["ai", "rule-based"]) })
      .parse(await readJson(req));
    return { assignment: await assignIntervention(getDb(), host, id, input) };
  });
}
