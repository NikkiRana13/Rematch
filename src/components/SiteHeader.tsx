"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { A11yControls } from "./a11y";
import { useSession } from "./session";
import { siteArea } from "./ThemeShell";

export function SiteHeader() {
  const { session, refresh } = useSession();
  const path = usePathname();
  // Re-check sign-in on navigation so "My roadmap" appears right after joining or signing in.
  useEffect(() => {
    void refresh();
  }, [path, refresh]);
  const area = siteArea(path);
  // Each side of the site shows only its own navigation.
  const nav: { href: string; label: string; active: boolean }[] =
    area === "student"
      ? [
          { href: "/join", label: "Join", active: path.startsWith("/join") },
          { href: "/me", label: "My sprints", active: path.startsWith("/me") || path.startsWith("/play") },
          ...(session?.learner ? [{ href: "/roadmap", label: "My roadmap", active: path.startsWith("/roadmap") }] : []),
        ]
      : area === "teacher"
        ? [
            { href: "/host", label: "Dashboard", active: path === "/host" || path.startsWith("/host/competitions") },
            { href: "/host/plans", label: "Learning plans", active: path.startsWith("/host/plans") },
            { href: "/host/overview", label: "Class overview", active: path.startsWith("/host/overview") },
          ]
        : [];
  return (
    <header className="border-b border-line bg-cream/90 backdrop-blur sticky top-0 z-10">
      {session?.mode === "local-demo" && (
        <div className="bg-amber-soft text-amber text-xs sm:text-sm px-4 py-1.5 text-center" role="note">
          <strong>Local demo mode:</strong> fictional seeded data stored in a file on this computer only — no shared database, not
          for cross-device classroom use. Reasoning analysis is {session.aiConfigured ? "AI (Anthropic)" : "rule-based (not AI)"}.
        </div>
      )}
      {session?.mode === "unconfigured" && (
        <div className="bg-rose-soft text-rose text-sm px-4 py-1.5 text-center" role="alert">
          Rematch is not configured. Add Supabase environment variables (see README).
        </div>
      )}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 flex-wrap">
        <Link href="/" className="font-bold text-xl tracking-tight flex items-center gap-2">
          <span aria-hidden="true" className="inline-grid place-items-center h-8 w-8 rounded-xl bg-violet text-base">
            R
          </span>
          Rematch
        </Link>
        <nav aria-label="Main" className="flex-1">
          <ul className="flex gap-1 sm:gap-2 text-sm font-medium">
            {nav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={n.active ? "page" : undefined}
                  className={`rounded-lg px-2.5 py-1.5 hover:bg-violet-soft ${n.active ? "bg-violet-soft text-violet-strong" : ""}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {area !== "start" && (
          <Link href="/" className="text-sm underline text-navy-soft hover:text-violet-strong">
            {area === "student" ? "I'm a teacher" : "I'm a student"}
          </Link>
        )}
        <A11yControls />
      </div>
    </header>
  );
}
