import { randomInt, randomUUID } from "node:crypto";
import { AuthzError } from "../authz";
import { hashToken, newLearnerToken } from "../auth/tokens";
import type { Db } from "../db/types";
import type { Learner } from "../types";
import { ServiceError } from "./errors";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Resolves a learner from a session token (primary token or an additional device session). */
export async function learnerForToken(db: Db, token: string): Promise<Learner | null> {
  const hash = hashToken(token);
  const [primary] = await db.select("learners", { eq: { tokenHash: hash } });
  if (primary) return primary;
  const [session] = await db.select("learner_sessions", { eq: { tokenHash: hash } });
  if (!session) return null;
  const [learner] = await db.select("learners", { eq: { id: session.learnerId } });
  return learner ?? null;
}

export function formatResumeCode(raw: string): string {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.match(/.{1,4}/g)?.join("-") ?? c;
}

function normalizeResumeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Issues a new private resume code (12 characters, ~59 bits) and stores only its hash.
 * Any previous code stops working.
 */
export async function issueResumeCode(db: Db, learner: Learner | null): Promise<string> {
  if (!learner) throw new AuthzError(401, "Join a sprint first.");
  let code = "";
  for (let i = 0; i < 12; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  await db.update("learners", { id: learner.id }, { resumeCodeHash: hashToken(`resume:${code}`) });
  return formatResumeCode(code);
}

/** Exchanges a resume code for a new device session token (the code itself is never stored). */
export async function resumeWithCode(db: Db, input: string): Promise<{ learner: Learner; token: string }> {
  const code = normalizeResumeCode(input);
  if (code.length !== 12) throw new ServiceError(400, "invalid_code", "Resume codes have 12 letters and numbers.");
  const [learner] = await db.select("learners", { eq: { resumeCodeHash: hashToken(`resume:${code}`) } });
  if (!learner) throw new ServiceError(404, "code_not_found", "That resume code didn't match. Check it and try again.");
  const token = newLearnerToken();
  await db.insert("learner_sessions", { id: randomUUID(), learnerId: learner.id, tokenHash: hashToken(token), createdAt: new Date().toISOString() });
  return { learner, token };
}
