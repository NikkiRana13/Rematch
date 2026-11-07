import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { classProgress } from "@/lib/services/plans";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => classProgress(getDb(), await getHost(), id));
}
