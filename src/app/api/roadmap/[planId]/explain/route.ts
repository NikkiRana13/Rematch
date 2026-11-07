import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { aiCaller } from "@/lib/aiCaller";
import { explainProgress } from "@/lib/services/roadmap";

const Input = z.object({ ask: z.enum(["ready", "next", "why"]), lectureId: z.string().nullable().optional(), objectiveId: z.string().nullable().optional() });

export async function POST(req: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return handle(async () => {
    const input = Input.parse(await readJson(req));
    return { guide: await explainProgress(getDb(), await getLearner(), planId, input.ask, input, aiCaller()) };
  });
}
