import "server-only";
import { cookies } from "next/headers";
import { hashToken } from "./tokens";
import { getDb } from "../db";
import type { Learner } from "../types";

export const LEARNER_COOKIE = "rematch_learner";

export const learnerCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 120,
};

/**
 * Resolves the participant session from the server-issued, httpOnly token cookie.
 * Only a hash of the token is stored. Nicknames and room codes are never used for authorization.
 */
export async function getLearner(): Promise<Learner | null> {
  const token = (await cookies()).get(LEARNER_COOKIE)?.value;
  if (!token || token.length < 20) return null;
  const [learner] = await getDb().select("learners", { eq: { tokenHash: hashToken(token) } });
  return learner ?? null;
}
