import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-violet text-white hover:bg-violet-strong shadow-sm",
  secondary: "bg-white text-navy border border-line hover:border-violet",
  ghost: "text-violet-strong hover:bg-violet-soft",
  success: "bg-green text-white hover:brightness-110",
  danger: "bg-white text-rose border border-rose/40 hover:bg-rose-soft",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={`rounded-3xl border border-line bg-surface p-5 sm:p-6 shadow-[0_1px_0_rgba(27,42,74,0.04)] ${className}`} {...rest}>
      {children}
    </section>
  );
}

const BADGE: Record<string, string> = {
  violet: "bg-violet-soft text-violet-strong",
  green: "bg-green-soft text-green",
  amber: "bg-amber-soft text-amber",
  rose: "bg-rose-soft text-rose",
  navy: "bg-cream-2 text-navy",
};

export function Badge({ tone = "navy", children, className = "" }: { tone?: keyof typeof BADGE; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[tone]} ${className}`}>{children}</span>;
}

export function Alert({
  tone = "violet",
  title,
  children,
  role,
}: {
  tone?: "violet" | "green" | "amber" | "rose";
  title?: string;
  children?: ReactNode;
  role?: "alert" | "status";
}) {
  const cls = {
    violet: "border-violet/30 bg-violet-soft",
    green: "border-green/30 bg-green-soft",
    amber: "border-amber/30 bg-amber-soft",
    rose: "border-rose/30 bg-rose-soft",
  }[tone];
  return (
    <div role={role} className={`rounded-2xl border p-4 ${cls}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="text-sm mt-1">{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 text-navy-soft py-8 justify-center">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet border-t-transparent" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-navy-soft mt-2">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block font-semibold text-sm">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-navy-soft">{hint}</p>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-navy placeholder:text-navy-soft/70 focus:border-violet";

export function SubjectBadge({ subject }: { subject: "reading" | "math" }) {
  return subject === "reading" ? <Badge tone="violet">📖 Reading</Badge> : <Badge tone="green">➗ Math</Badge>;
}

export function StatusBadge({ status }: { status: "draft" | "open" | "closed" }) {
  if (status === "open") return <Badge tone="green">● Open</Badge>;
  if (status === "closed") return <Badge tone="navy">Closed</Badge>;
  return <Badge tone="amber">Draft</Badge>;
}
