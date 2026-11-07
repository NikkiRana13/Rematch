import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { CompetitionInput, getCompetitionForHost, updateCompetition } from "@/lib/services/host";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => ({ competition: await getCompetitionForHost(getDb(), await getHost(), id) }));
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const host = await getHost();
    const input = CompetitionInput.parse(await readJson(req));
    return { competition: await updateCompetition(getDb(), host, id, input) };
  });
}
