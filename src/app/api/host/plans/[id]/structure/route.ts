import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { saveStructure, StructureInput } from "@/lib/services/plans";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => saveStructure(getDb(), await getHost(), id, StructureInput.parse(await readJson(req))));
}
