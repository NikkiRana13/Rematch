import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { createPassage, PassageInput } from "@/lib/services/host";

export async function POST(req: Request) {
  return handle(async () => {
    const host = await getHost();
    return { passage: await createPassage(getDb(), host, "reading", PassageInput.parse(await readJson(req))) };
  });
}
