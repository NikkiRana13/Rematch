import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { createQuestion, QuestionInput } from "@/lib/services/host";

export async function POST(req: Request) {
  return handle(async () => {
    const host = await getHost();
    return { question: await createQuestion(getDb(), host, QuestionInput.parse(await readJson(req))) };
  });
}
