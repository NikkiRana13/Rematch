"use client";

import type { ReactNode } from "react";
import { Badge } from "./ui";

export interface SkillProgress {
  skill: string;
  label: string;
  subject: "reading" | "math";
  accuracy: { numerator: number; denominator: number; rate: number | null };
  distinctQuestions: number;
  limitedEvidence: boolean;
  comebacks: { numerator: number; denominator: number; rate: number | null };
}

export function ScorePills({ initialPoints, comebackPoints }: { initialPoints: number; comebackPoints: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="rounded-2xl bg-violet-soft px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-strong">First-try points</p>
        <p className="text-2xl font-bold">{initialPoints}</p>
      </div>
      <div className="rounded-2xl bg-green-soft px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-green">Comeback points</p>
        <p className="text-2xl font-bold">{comebackPoints}</p>
      </div>
    </div>
  );
}

function Bar({ rate, tone }: { rate: number | null; tone: "violet" | "green" }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-cream-2 overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full ${tone === "violet" ? "bg-violet" : "bg-green"} transition-all`} style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
    </div>
  );
}

/** Private, per-subject skill progress. Simple accuracy — not a mastery score. */
export function SubjectProgress({ title, icon, skills }: { title: string; icon: ReactNode; skills: SkillProgress[] }) {
  return (
    <div className="space-y-3">
      <h3 className="font-bold flex items-center gap-2">
        <span aria-hidden="true">{icon}</span> {title}
      </h3>
      {skills.length === 0 ? (
        <p className="text-sm text-navy-soft">No {title.toLowerCase()} questions answered yet.</p>
      ) : (
        <ul className="space-y-3">
          {skills.map((s) => (
            <li key={s.skill} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium">{s.label}</span>
                <span>
                  {s.accuracy.numerator} of {s.accuracy.denominator} first tries correct
                </span>
              </div>
              <Bar rate={s.accuracy.rate} tone={s.subject === "reading" ? "violet" : "green"} />
              <div className="flex flex-wrap gap-2">
                {s.limitedEvidence && <Badge tone="amber">Limited evidence — fewer than 3 questions so far</Badge>}
                {s.comebacks.denominator > 0 && (
                  <Badge tone="green">
                    Comebacks: {s.comebacks.numerator} of {s.comebacks.denominator}
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
