import "server-only";
import { connection } from "next/server";
import { ZodError } from "zod";
import { AuthzError } from "./authz";
import { DbUnavailableError, UniqueViolationError } from "./db/types";
import { ServiceError } from "./services/errors";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof AuthzError) return json({ error: e.message, code: "authz" }, e.status);
  if (e instanceof ServiceError) return json({ error: e.message, code: e.code }, e.status);
  if (e instanceof ZodError)
    return json({ error: e.issues.map((i) => i.message).join(" "), code: "invalid_input" }, 400);
  if (e instanceof UniqueViolationError) return json({ error: "That was already saved.", code: "duplicate" }, 409);
  if (e instanceof DbUnavailableError)
    return json({ error: "We couldn't reach the database. Your work wasn't lost — please try again.", code: "db_unavailable" }, 503);
  console.error("[api] unexpected error", e);
  return json({ error: "Something went wrong. Please try again.", code: "server_error" }, 500);
}

export async function handle(fn: () => Promise<unknown>) {
  await connection(); // API responses are always per-request (cookies, sessions, live data)
  try {
    return json(await fn());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ServiceError(400, "invalid_json", "Invalid request body.");
  }
}
