import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { CompetitionInput, createCompetition, listCompetitions } from "@/lib/services/host";

export async function GET() {
  return handle(async () => ({ competitions: await listCompetitions(getDb(), await getHost()) }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const host = await getHost();
    const input = CompetitionInput.parse(await readJson(req));
    return { competition: await createCompetition(getDb(), host, input) };
  });
}
