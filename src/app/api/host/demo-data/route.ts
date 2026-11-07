import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { loadDemoData } from "@/lib/services/host";

/** Adds clearly labelled synthetic demonstration history to the signed-in host's own account. */
export async function POST() {
  return handle(async () => loadDemoData(getDb(), await getHost()));
}
