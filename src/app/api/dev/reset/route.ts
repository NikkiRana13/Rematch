import { handle, json } from "@/lib/api";
import { appMode } from "@/lib/env";
import { resetLocalDb } from "@/lib/db";

/** Local demo only: restore the seeded demo state. */
export async function POST() {
  if (appMode() !== "local-demo") return json({ error: "Not available.", code: "not_available" }, 404);
  return handle(async () => {
    resetLocalDb();
    return { ok: true };
  });
}
