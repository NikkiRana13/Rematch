import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse, json, readJson } from "@/lib/api";
import { appMode } from "@/lib/env";
import { DEMO_HOST_COOKIE, makeDemoHostCookie } from "@/lib/auth/host";
import { DEMO_HOSTS } from "@/lib/services/localSeed";

/** Local demo sign-in. Disabled whenever Supabase is configured or in unconfigured production. */
export async function POST(req: Request) {
  try {
    if (appMode() !== "local-demo") return json({ error: "Demo sign-in is not available.", code: "not_available" }, 404);
    const { hostId } = z.object({ hostId: z.string() }).parse(await readJson(req));
    if (!DEMO_HOSTS.some((h) => h.id === hostId)) return json({ error: "Unknown demo host.", code: "invalid" }, 400);
    (await cookies()).set(DEMO_HOST_COOKIE, makeDemoHostCookie(hostId), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
