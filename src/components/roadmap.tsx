"use client";

import type { ReactNode } from "react";

export type ObjectiveStatus = "not_assessed" | "in_progress" | "needs_practice" | "demonstrated";

const STATUS: Record<ObjectiveStatus, { label: string; icon: string; cls: string }> = {
  demonstrated: { label: "Demonstrated in Rematch", icon: "✓", cls: "bg-green-soft text-green border-green/30" },
  in_progress: { label: "In progress", icon: "◐", cls: "bg-violet-soft text-violet-strong border-violet/30" },
  needs_practice: { label: "Needs practice", icon: "↻", cls: "bg-amber-soft text-amber border-amber/30" },
  not_assessed: { label: "Not assessed", icon: "○", cls: "bg-cream-2 text-navy-soft border-line" },
};

/** Status pill: icon + text + colour (never colour alone). */
export function StatusPill({ status, small }: { status: ObjectiveStatus; small?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}

export function statusLabel(s: ObjectiveStatus) {
  return STATUS[s].label;
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max ? Math.round((100 * value) / max) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-3 w-full overflow-hidden rounded-full bg-cream-2">
      <div className="h-full rounded-full bg-green transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const KIND_LABEL: Record<string, string> = { initial: "Sprint question", comeback: "Comeback", roadmap: "Rematch" };

export function RuleNote({ ruleText, children }: { ruleText: string; children?: ReactNode }) {
  return (
    <details className="rounded-2xl border border-line bg-white p-4 text-sm">
      <summary className="cursor-pointer font-semibold">How is progress decided?</summary>
      <div className="mt-2 space-y-2 text-navy-soft">
        <p>
          An objective is <strong>“Demonstrated in Rematch”</strong> when you have {ruleText}.
        </p>
        <p>
          Only questions your teacher linked to that objective count. Each question counts once, and a question you&apos;ve seen before (with its answer
          shown) counts as practice, not new evidence. No answers yet means <strong>Not assessed</strong> — not a problem, just not tried.
        </p>
        <p>This is an MVP progress rule to help you and your teacher plan practice. It isn&apos;t a grade or a mastery score.</p>
        {children}
      </div>
    </details>
  );
}
