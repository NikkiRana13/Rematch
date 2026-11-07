import "server-only";

export function supabaseConfig(): { url: string; anonKey: string; serviceRoleKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && anonKey && serviceRoleKey) return { url, anonKey, serviceRoleKey };
  return null;
}

export type AppMode = "supabase" | "local-demo" | "unconfigured";

/**
 * Local demo mode is only available when Supabase is NOT configured, and never in a
 * production build unless explicitly allowed for a local presentation. It can never
 * be used to bypass Supabase auth, because the two modes are mutually exclusive.
 */
export function appMode(): AppMode {
  if (supabaseConfig()) return "supabase";
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd || process.env.REMATCH_ALLOW_LOCAL_DEMO === "true") return "local-demo";
  return "unconfigured";
}
