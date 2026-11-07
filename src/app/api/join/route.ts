import { cookies } from "next/headers";
import { errorResponse, json, readJson } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner, LEARNER_COOKIE, learnerCookieOptions } from "@/lib/auth/participant";
import { joinCompetition, JoinInput } from "@/lib/services/play";

export async function POST(req: Request) {
  try {
    const input = JoinInput.parse(await readJson(req));
    const res = await joinCompetition(getDb(), await getLearner(), input);
    if (res.newToken) (await cookies()).set(LEARNER_COOKIE, res.newToken, learnerCookieOptions);
    return json({ competitionId: res.competition.id, nickname: res.participant.nickname });
  } catch (e) {
    return errorResponse(e);
  }
}
