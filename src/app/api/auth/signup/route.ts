import { z } from "zod";
import { errorResponse, json, readJson } from "@/lib/api";
import { appMode } from "@/lib/env";
import { supabaseAuthClient } from "@/lib/auth/host";

export async function POST(req: Request) {
  try {
    if (appMode() !== "supabase") return json({ error: "Sign-up requires Supabase.", code: "not_available" }, 404);
    const input = z
      .object({
        email: z.string().email(),
        password: z.string().min(8, "Use at least 8 characters."),
        displayName: z.string().trim().min(1).max(60),
        hostRole: z.enum(["teacher", "student"]),
      })
      .parse(await readJson(req));
    const supabase = await supabaseAuthClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { display_name: input.displayName, host_role: input.hostRole } },
    });
    if (error) return json({ error: error.message, code: "signup_failed" }, 400);
    return json({ ok: true, needsEmailConfirmation: !data.session });
  } catch (e) {
    return errorResponse(e);
  }
}
