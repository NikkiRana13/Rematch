import { cookies } from "next/headers";
import { handle } from "@/lib/api";
import { appMode } from "@/lib/env";
import { DEMO_HOST_COOKIE, supabaseAuthClient } from "@/lib/auth/host";

export async function POST() {
  return handle(async () => {
    (await cookies()).delete(DEMO_HOST_COOKIE);
    if (appMode() === "supabase") await (await supabaseAuthClient()).auth.signOut();
    return { ok: true };
  });
}
