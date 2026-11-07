import { cookies } from "next/headers";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { errorResponse, json, readJson } from "@/lib/api";
import { appMode } from "@/lib/env";
import { getDb } from "@/lib/db";
import { hashToken, newLearnerToken } from "@/lib/auth/tokens";
import { LEARNER_COOKIE, learnerCookieOptions } from "@/lib/auth/participant";

/** LOCAL DEMO ONLY: view the roadmap as one of the fictional demo learners. Disabled with Supabase. */
export async function GET() {
  await connection();
  if (appMode() !== "local-demo") return json({ learners: [] });
  const learners = (await getDb().select("learners", { eq: { isSynthetic: true } })).map((l) => ({ id: l.id, nickname: l.nickname }));
  return json({ learners });
}

export async function POST(req: Request) {
  try {
    if (appMode() !== "local-demo") return json({ error: "Not available.", code: "not_available" }, 404);
    const { learnerId } = z.object({ learnerId: z.string() }).parse(await readJson(req));
    const db = getDb();
    const [learner] = await db.select("learners", { eq: { id: learnerId, isSynthetic: true } });
    if (!learner) return json({ error: "Unknown demo learner.", code: "invalid" }, 400);
    const token = newLearnerToken();
    await db.insert("learner_sessions", { id: randomUUID(), learnerId, tokenHash: hashToken(token), createdAt: new Date().toISOString() });
    (await cookies()).set(LEARNER_COOKIE, token, learnerCookieOptions);
    return json({ nickname: learner.nickname });
  } catch (e) {
    return errorResponse(e);
  }
}
