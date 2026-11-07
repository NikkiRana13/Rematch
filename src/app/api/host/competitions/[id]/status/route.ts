import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { setCompetitionStatus } from "@/lib/services/host";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const host = await getHost();
    const { status } = z.object({ status: z.enum(["draft", "open", "closed"]) }).parse(await readJson(req));
    return { competition: await setCompetitionStatus(getDb(), host, id, status) };
  });
}
