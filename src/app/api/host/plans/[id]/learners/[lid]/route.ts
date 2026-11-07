import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { learnerDetailForHost } from "@/lib/services/plans";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string; lid: string }> }) {
  const { id, lid } = await params;
  return handle(async () => learnerDetailForHost(getDb(), await getHost(), id, lid));
}
