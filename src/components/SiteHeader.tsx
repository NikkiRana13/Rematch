"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { A11yControls } from "./a11y";
import { useSession } from "./session";

export function SiteHeader() {
  const { session } = useSession();
  const path = usePathname();
  const nav = [
    { href: "/join", label: "Join" },
    { href: "/me", label: "My sprints" },
    { href: "/host", label: "Host" },
  ];
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
          <span aria-hidden="true" className="inline-grid place-items-center h-8 w-8 rounded-xl bg-violet text-white text-base">
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
                  aria-current={path.startsWith(n.href) ? "page" : undefined}
                  className={`rounded-lg px-2.5 py-1.5 hover:bg-violet-soft ${path.startsWith(n.href) ? "bg-violet-soft text-violet-strong" : ""}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <A11yControls />
      </div>
    </header>
  );
}
