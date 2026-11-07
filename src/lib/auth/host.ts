import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { appMode, supabaseConfig } from "../env";
import { getDb } from "../db";
import { DEMO_HOSTS } from "../services/localSeed";
import type { Host } from "../types";

export const DEMO_HOST_COOKIE = "rematch_demo_host";

/** Supabase client bound to the request cookies (anon key; used only for auth). */
export async function supabaseAuthClient() {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase is not configured");
  const store = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const c of toSet) store.set(c.name, c.value, c.options);
        } catch {
          // Called from a Server Component render where cookies are read-only; safe to ignore.
        }
      },
    },
  });
}

function demoSecret(): string {
  if (process.env.REMATCH_DEMO_SECRET) return process.env.REMATCH_DEMO_SECRET;
  const file = path.join(process.cwd(), ".data", "demo-secret");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    const s = randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, s);
    return s;
  }
}

function sign(value: string): string {
  return createHmac("sha256", demoSecret()).update(value).digest("base64url");
}

export function makeDemoHostCookie(hostId: string): string {
  return `${hostId}.${sign(hostId)}`;
}

export function verifyDemoHostCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i <= 0) return null;
  const id = raw.slice(0, i);
  const sig = Buffer.from(raw.slice(i + 1));
  const expected = Buffer.from(sign(id));
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;
  return id;
}

/** Returns the signed-in host, or null. Demo sessions are only honoured in local demo mode. */
export async function getHost(): Promise<Host | null> {
  const mode = appMode();
  if (mode === "local-demo") {
    const id = verifyDemoHostCookie((await cookies()).get(DEMO_HOST_COOKIE)?.value);
    if (!id || !DEMO_HOSTS.some((h) => h.id === id)) return null;
    const [host] = await getDb().select("hosts", { eq: { id } });
    return host ?? null;
  }
  if (mode !== "supabase") return null;

  const supabase = await supabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const db = getDb();
  const [existing] = await db.select("hosts", { eq: { id: data.user.id } });
  if (existing) return existing;
  const meta = data.user.user_metadata ?? {};
  const host: Host = {
    id: data.user.id,
    displayName: String(meta.display_name ?? data.user.email?.split("@")[0] ?? "Host").slice(0, 60),
    hostRole: meta.host_role === "student" ? "student" : "teacher",
    createdAt: new Date().toISOString(),
  };
  try {
    return await db.insert("hosts", host);
  } catch {
    const [again] = await db.select("hosts", { eq: { id: host.id } });
    return again ?? null;
  }
}
