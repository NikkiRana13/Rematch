import { z } from "zod";
import { errorResponse, json, readJson } from "@/lib/api";
import { appMode } from "@/lib/env";
import { supabaseAuthClient } from "@/lib/auth/host";

export async function POST(req: Request) {
  try {
    if (appMode() !== "supabase") return json({ error: "Email sign-in requires Supabase.", code: "not_available" }, 404);
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(await readJson(req));
    const supabase = await supabaseAuthClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return json({ error: "Email or password is incorrect.", code: "auth_failed" }, 401);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
