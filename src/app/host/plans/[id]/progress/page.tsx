"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { HostGate } from "@/components/HostGate";
import { api, post } from "@/components/fetcher";
import { MathText } from "@/components/MathText";
import { fmtDate, KIND_LABEL, StatusPill, statusLabel, type ObjectiveStatus } from "@/components/roadmap";
import { Alert, Badge, Button, Card, EmptyState, Field, Spinner, inputCls } from "@/components/ui";

interface ClassData {
  plan: { id: string; title: string; unitLabel: string; publishedVersion: number; isDemoData: boolean };
  lectures: { id: string; number: number; title: string; objectives: { id: string; text: string }[] }[];
  learners: { learnerId: string; nickname: string; synthetic: boolean; overall: { demonstrated: number; total: number }; statuses: Record<string, { status: ObjectiveStatus; overridden: boolean }> }[];
}
interface Detail {
  learner: { id: string; nickname: string; synthetic: boolean };
  roadmap: {
    ruleText: string;
    lectures: {
      id: string;
      number: number;
      title: string;
      status: ObjectiveStatus;
      objectives: {
        id: string;
        text: string;
        practiceAvailable: boolean;
        progress: {
          status: ObjectiveStatus;
          computedStatus: ObjectiveStatus;
          override: { status: ObjectiveStatus; reason: string } | null;
          reasons: string[];
          evidence: { attemptId: string; questionId: string; question: string; kind: string; isCorrect: boolean; createdAt: string; counted: boolean; note: string }[];
        };
      }[];
    }[];
  };
  overrideHistory: { id: string; objectiveId: string; status: ObjectiveStatus; reason: string; computedStatusAtOverride: ObjectiveStatus; createdAt: string }[];
}

const ICON: Record<ObjectiveStatus, string> = { demonstrated: "✓", in_progress: "◐", needs_practice: "↻", not_assessed: "○" };
const CELL: Record<ObjectiveStatus, string> = {
  demonstrated: "bg-green-soft text-green",
  in_progress: "bg-violet-soft text-violet-strong",
  needs_practice: "bg-amber-soft text-amber",
  not_assessed: "bg-cream-2 text-navy-soft",
};

export default function ClassProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <HostGate>{() => <ClassProgress id={id} />}</HostGate>;
}

function ClassProgress({ id }: { id: string }) {
  const [data, setData] = useState<ClassData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(() => api<ClassData>(`/api/host/plans/${id}/progress`).then(setData).catch((e) => setError((e as Error).message)), [id]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="rose" role="alert" title="Couldn't load class progress">{error}</Alert>;
  if (!data) return <Spinner label="Calculating class progress" />;
  const objectives = data.lectures.flatMap((l) => l.objectives.map((o, i) => ({ ...o, label: `${data.plan.unitLabel[0]}${l.number}.${i + 1}`, lecture: l })));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/host/plans/${id}`} className="text-sm underline">
          ← Plan
        </Link>
        <h1 className="text-3xl font-bold">Class progress: {data.plan.title}</h1>
        <p className="text-navy-soft">
          Published v{data.plan.publishedVersion}. Statuses come from each learner&apos;s answers on mapped questions in your classrooms. Visible only to you and each learner.
        </p>
        {data.plan.isDemoData && <Badge tone="amber">Demonstration data — fictional learners</Badge>}
      </div>

      <Card>
        <h2 className="text-xl font-bold mb-2">Objectives</h2>
        <ul className="grid gap-1 sm:grid-cols-2 text-sm">
          {objectives.map((o) => (
            <li key={o.id}>
              <strong>{o.label}</strong> {o.text}
            </li>
          ))}
        </ul>
        <p className="text-xs text-navy-soft mt-3">
          Key: ✓ Demonstrated in Rematch · ↻ Needs practice · ◐ In progress · ○ Not assessed · * teacher override
        </p>
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="text-xl font-bold mb-3">Learners ({data.learners.length})</h2>
        {data.learners.length === 0 ? (
          <EmptyState title="No learners yet">Assign this plan to a classroom. Learners appear once they join one of its competitions.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Objective status for each learner</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left p-2">Learner</th>
                <th scope="col" className="text-left p-2">Overall</th>
                {objectives.map((o) => (
                  <th key={o.id} scope="col" className="p-2" title={o.text}>
                    {o.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.learners.map((l) => (
                <tr key={l.learnerId} className="border-t border-line">
                  <th scope="row" className="text-left p-2 font-semibold">
                    <button className="underline text-violet-strong" onClick={() => setSelected(l.learnerId)} aria-pressed={selected === l.learnerId}>
                      {l.nickname}
                    </button>
                  </th>
                  <td className="p-2 whitespace-nowrap">
                    {l.overall.demonstrated} of {l.overall.total}
                  </td>
                  {objectives.map((o) => {
                    const s = l.statuses[o.id];
                    return (
                      <td key={o.id} className="p-1 text-center">
                        <span className={`inline-block rounded-lg px-2 py-1 font-bold ${CELL[s.status]}`} title={statusLabel(s.status)}>
                          <span aria-hidden="true">{ICON[s.status]}</span>
                          <span className="sr-only">{statusLabel(s.status)}</span>
                          {s.overridden && <span aria-label="teacher override">*</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {selected && <LearnerDetail key={selected} planId={id} learnerId={selected} unitLabel={data.plan.unitLabel} onChanged={load} />}
    </div>
  );
}

function LearnerDetail({ planId, learnerId, unitLabel, onChanged }: { planId: string; learnerId: string; unitLabel: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api<Detail>(`/api/host/plans/${planId}/learners/${learnerId}`).then(setD).catch((e) => setErr((e as Error).message)), [planId, learnerId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (err) return <Alert tone="rose" role="alert">{err}</Alert>;
  if (!d) return <Spinner label="Loading learner" />;
  return (
    <Card className="space-y-4">
      <h2 className="text-2xl font-bold">
        {d.learner.nickname} {d.learner.synthetic && <Badge tone="amber">Fictional</Badge>}
      </h2>
      <p className="text-sm text-navy-soft">Rule: {d.roadmap.ruleText}. Overrides need a reason and keep the computed status and evidence.</p>
      {d.roadmap.lectures.map((l) => (
        <section key={l.id} className="space-y-2">
          <h3 className="font-bold flex flex-wrap items-center gap-2">
            {unitLabel} {l.number}: {l.title} <StatusPill status={l.status} small />
          </h3>
          {l.objectives.map((o) => (
            <ObjectiveAudit key={o.id} planId={planId} learnerId={learnerId} o={o} history={d.overrideHistory.filter((h) => h.objectiveId === o.id)} onSaved={() => (load(), onChanged())} />
          ))}
        </section>
      ))}
    </Card>
  );
}

function ObjectiveAudit({
  planId,
  learnerId,
  o,
  history,
  onSaved,
}: {
  planId: string;
  learnerId: string;
  o: Detail["roadmap"]["lectures"][number]["objectives"][number];
  history: Detail["overrideHistory"];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ObjectiveStatus>(o.progress.status);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const p = o.progress;
  return (
    <div className="rounded-xl border border-line p-3 space-y-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold flex-1 min-w-48">{o.text}</p>
        <StatusPill status={p.status} small />
      </div>
      {p.override && (
        <p className="text-violet-strong">
          Override: {statusLabel(p.override.status)} — “{p.override.reason}”. Computed: {statusLabel(p.computedStatus)}.
        </p>
      )}
      <ul className="list-disc pl-5 text-navy-soft">
        {p.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {p.evidence.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">Evidence ({p.evidence.length} attempts)</summary>
          <ul className="mt-1 space-y-1">
            {p.evidence.map((e) => (
              <li key={e.attemptId}>
                {fmtDate(e.createdAt)} · {KIND_LABEL[e.kind] ?? e.kind} · {e.isCorrect ? "✓ correct" : "✗ incorrect"} · <MathText text={e.question.slice(0, 80)} /> · {e.counted ? "counted" : e.note}
              </li>
            ))}
          </ul>
        </details>
      )}
      {history.length > 0 && (
        <details>
          <summary className="cursor-pointer">Override history ({history.length})</summary>
          <ul className="mt-1">
            {history.map((h) => (
              <li key={h.id}>
                {fmtDate(h.createdAt)}: {statusLabel(h.status)} (computed then: {statusLabel(h.computedStatusAtOverride)}) — “{h.reason}”
              </li>
            ))}
          </ul>
        </details>
      )}
      <Button variant="ghost" className="py-1 text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Cancel" : "Override status"}
      </Button>
      {open && (
        <form
          className="flex flex-wrap gap-2 items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post(`/api/host/plans/${planId}/overrides`, { objectiveId: o.id, learnerId, status, reason });
              setOpen(false);
              setReason("");
              onSaved();
            } catch (e2) {
              setErr((e2 as Error).message);
            }
          }}
        >
          <Field label="Status" htmlFor={`st-${o.id}`}>
            <select id={`st-${o.id}`} className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as ObjectiveStatus)}>
              {(["not_assessed", "in_progress", "needs_practice", "demonstrated"] as const).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex-1 min-w-48">
            <Field label="Reason (required)" htmlFor={`rs-${o.id}`}>
              <input id={`rs-${o.id}`} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} />
            </Field>
          </div>
          <Button type="submit" disabled={reason.trim().length < 5}>
            Save override
          </Button>
          {err && <p className="text-rose w-full">{err}</p>}
        </form>
      )}
    </div>
  );
}
