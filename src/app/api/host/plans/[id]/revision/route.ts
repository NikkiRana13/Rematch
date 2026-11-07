import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { discardRevision, startRevision } from "@/lib/services/plans";

export async function POST(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => startRevision(getDb(), await getHost(), id));
}
export async function DELETE(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => discardRevision(getDb(), await getHost(), id));
}
