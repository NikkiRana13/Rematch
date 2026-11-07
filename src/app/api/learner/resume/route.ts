import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { LEARNER_COOKIE, learnerCookieOptions } from "@/lib/auth/participant";
import { resumeWithCode } from "@/lib/services/learnerAccess";

export async function POST(req: Request) {
  try {
    const { code } = z.object({ code: z.string().max(40) }).parse(await readJson(req));
    const { learner, token } = await resumeWithCode(getDb(), code);
    (await cookies()).set(LEARNER_COOKIE, token, learnerCookieOptions);
    return json({ nickname: learner.nickname });
  } catch (e) {
    return errorResponse(e);
  }
}
