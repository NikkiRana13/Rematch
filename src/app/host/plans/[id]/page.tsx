"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import { HostGate } from "@/components/HostGate";
import { api, post } from "@/components/fetcher";
import { MathText } from "@/components/MathText";
import { Alert, Badge, Button, Card, Field, Spinner, inputCls } from "@/components/ui";

interface Obj {
  id?: string;
  key?: string;
  text: string;
  skill: string | null;
  required: boolean;
  needsReview: boolean;
  reviewNote: string | null;
  sourceQuote: string | null;
  questionIds: string[];
}
interface Lec {
  id?: string;
  number: number;
  title: string;
  objectives: Obj[];
}
interface Rule {
  minDistinctQuestions: 2 | 3 | 4;
  minCorrectInRecent: number;
  requireLatestCorrect: boolean;
  requireTransferCorrect: boolean;
}
interface PlanData {
  plan: {
    id: string;
    title: string;
    subject: "reading" | "math" | "mixed";
    courseLabel: string;
    description: string;
    unitLabel: "Lecture" | "Lesson";
    status: "draft" | "published";
    publishedVersion: number | null;
    draftVersion: number | null;
    evidenceRule: Rule;
    isDemoData: boolean;
  };
  editing: boolean;
  version: number;
  lectures: Lec[];
  assignedCompetitionIds: string[];
}
interface BankQ {
  id: string;
  subject: string;
  skill: string;
  questionRole: string;
  prompt: string;
  verified: boolean;
}
interface Skill {
  id: string;
  subject: string;
  label: string;
}

const PRESETS: { label: string; rule: Rule }[] = [
  { label: "Standard (default)", rule: { minDistinctQuestions: 3, minCorrectInRecent: 2, requireLatestCorrect: true, requireTransferCorrect: true } },
  { label: "Lighter", rule: { minDistinctQuestions: 2, minCorrectInRecent: 2, requireLatestCorrect: true, requireTransferCorrect: true } },
  { label: "Stricter", rule: { minDistinctQuestions: 4, minCorrectInRecent: 3, requireLatestCorrect: true, requireTransferCorrect: true } },
];

export default function PlanEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <HostGate>
      {() => (
        <Suspense fallback={<Spinner label="Loading plan" />}>
          <Editor id={id} />
        </Suspense>
      )}
    </HostGate>
  );
}

function Editor({ id }: { id: string }) {
  const search = useSearchParams();
  const imported = useMemo(() => {
    try {
      const raw = search.get("imported");
      return raw ? (JSON.parse(raw) as { extraction: string; warnings: string[]; errorCode: string | null }) : null;
    } catch {
      return null;
    }
  }, [search]);
  const [data, setData] = useState<PlanData | null>(null);
  const [lectures, setLectures] = useState<Lec[]>([]);
  const [dirty, setDirty] = useState(false);
  const [bank, setBank] = useState<{ questions: BankQ[]; skills: Skill[] } | null>(null);
  const [comps, setComps] = useState<{ id: string; title: string; subject: string; status: string }[]>([]);
  const [msg, setMsg] = useState<{ tone: "green" | "rose"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(async () => {
    const d = await api<PlanData>(`/api/host/plans/${id}`);
    setData(d);
    setLectures(d.lectures);
    setDirty(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setMsg({ tone: "rose", text: (e as Error).message }));
    api<{ questions: BankQ[]; skills: Skill[] }>("/api/host/bank").then(setBank).catch(() => {});
    api<{ competitions: { id: string; title: string; subject: string; status: string }[] }>("/api/host/competitions").then((r) => setComps(r.competitions)).catch(() => {});
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ tone: "green", text: ok });
    } catch (e) {
      setMsg({ tone: "rose", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!data) return msg ? <Alert tone="rose" role="alert">{msg.text}</Alert> : <Spinner label="Loading plan" />;
  const { plan } = data;
  const editable = data.editing;
  const skills = (bank?.skills ?? []).filter((s) => plan.subject === "mixed" || s.subject === plan.subject);
  const flagged = lectures.flatMap((l) => l.objectives).filter((o) => o.needsReview).length;
  const update = (fn: (ls: Lec[]) => Lec[]) => {
    setLectures((ls) => fn(structuredClone(ls)));
    setDirty(true);
  };
  const saveStructure = () =>
    run(
      () =>
        api(`/api/host/plans/${id}/structure`, {
          method: "PUT",
          body: JSON.stringify({ lectures: lectures.map((l) => ({ number: l.number, title: l.title, objectives: l.objectives })) }),
        }),
      "Draft saved.",
    );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/host/plans" className="text-sm underline">
          ← Learning plans
        </Link>
        <div className="flex flex-wrap gap-2">
          {plan.status === "published" ? <Badge tone="green">Published v{plan.publishedVersion}</Badge> : <Badge tone="amber">Draft — not visible to students</Badge>}
          {editable && plan.status === "published" && <Badge tone="violet">Editing revision v{data.version} (students still see v{plan.publishedVersion})</Badge>}
          {plan.isDemoData && <Badge tone="amber">Demonstration data</Badge>}
        </div>
        <h1 className="text-3xl font-bold">{plan.title}</h1>
      </div>

      {imported && (
        <Alert tone={imported.errorCode ? "amber" : "violet"} title={`Imported draft (${imported.extraction === "ai" ? "AI-extracted" : "rule-based extraction"})`}>
          {imported.errorCode && <p>AI extraction wasn&apos;t used ({imported.errorCode}); a rule-based parser read your headings and bullet points instead.</p>}
          <p>Check every {plan.unitLabel.toLowerCase()} and objective against your file, map questions, and resolve flagged items before publishing.</p>
          {imported.warnings.length > 0 && (
            <ul className="list-disc pl-5 mt-1">
              {imported.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {msg && <Alert tone={msg.tone} role={msg.tone === "rose" ? "alert" : "status"}>{msg.text}</Alert>}

      <Card className="flex flex-wrap items-center gap-3">
        {editable ? (
          <>
            <Button disabled={busy || dirty || flagged > 0} onClick={() => run(() => post(`/api/host/plans/${id}/publish`), "Published! Students in assigned classrooms can now see this plan.")}>
              Publish{plan.status === "published" ? " revision" : ""}
            </Button>
            {dirty && <span className="text-sm text-amber">Save your changes before publishing.</span>}
            {!dirty && flagged > 0 && <span className="text-sm text-amber">Resolve {flagged} flagged objective(s) to publish.</span>}
            {plan.status === "published" && (
              <Button variant="danger" disabled={busy} onClick={() => run(() => api(`/api/host/plans/${id}/revision`, { method: "DELETE" }), "Revision discarded.")}>
                Discard revision
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={() => run(() => post(`/api/host/plans/${id}/revision`), "Revision started. Students keep seeing the published version until you publish.")}>
            Edit (start a revision)
          </Button>
        )}
        <Button variant="ghost" aria-pressed={preview} onClick={() => setPreview((v) => !v)}>
          {preview ? "Back to editing" : "Preview as student"}
        </Button>
        {plan.status === "published" && (
          <Link href={`/host/plans/${id}/progress`} className="font-semibold text-violet-strong underline">
            Class progress →
          </Link>
        )}
      </Card>

      {preview ? (
        <Preview plan={plan} lectures={lectures} bank={bank?.questions ?? []} />
      ) : (
        <>
          <MetaCard plan={plan} onSave={(m) => run(() => api(`/api/host/plans/${id}`, { method: "PUT", body: JSON.stringify(m) }), "Details saved.")} busy={busy} />
          <RuleCard rule={plan.evidenceRule} onSave={(r) => run(() => api(`/api/host/plans/${id}/rule`, { method: "PUT", body: JSON.stringify(r) }), "Progress rule saved.")} busy={busy} />

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">
                {plan.unitLabel}s and objectives {!editable && <span className="text-sm font-normal text-navy-soft">(published — start a revision to edit)</span>}
              </h2>
              {editable && (
                <Button disabled={busy || !dirty} onClick={saveStructure}>
                  Save draft
                </Button>
              )}
            </div>
            <p className="text-sm text-navy-soft">
              Only questions you map to an objective count as evidence for it. Write objectives as things students can show, e.g. “Compare…”, “Explain…”.
            </p>
            {lectures.map((l, li) => (
              <section key={li} className="rounded-2xl border border-line p-4 space-y-3" aria-label={`${plan.unitLabel} ${l.number}`}>
                <div className="flex flex-wrap gap-2 items-end">
                  <Field label={`${plan.unitLabel} #`} htmlFor={`ln-${li}`}>
                    <input
                      id={`ln-${li}`}
                      type="number"
                      min={0}
                      className={`${inputCls} w-24`}
                      value={l.number}
                      disabled={!editable}
                      onChange={(e) => update((ls) => ((ls[li].number = Number(e.target.value)), ls))}
                    />
                  </Field>
                  <div className="flex-1 min-w-48">
                    <Field label="Title" htmlFor={`lt-${li}`}>
                      <input id={`lt-${li}`} className={inputCls} value={l.title} disabled={!editable} onChange={(e) => update((ls) => ((ls[li].title = e.target.value), ls))} />
                    </Field>
                  </div>
                  {editable && (
                    <Button variant="danger" className="py-2" onClick={() => update((ls) => ls.filter((_, i) => i !== li))} aria-label={`Remove ${plan.unitLabel} ${l.number}`}>
                      Remove
                    </Button>
                  )}
                </div>
                {l.objectives.map((o, oi) => (
                  <ObjectiveEditor
                    key={oi}
                    o={o}
                    idx={`${li}-${oi}`}
                    editable={editable}
                    skills={skills}
                    bank={(bank?.questions ?? []).filter((q) => q.verified && (plan.subject === "mixed" || q.subject === plan.subject))}
                    onChange={(fn) => update((ls) => ((ls[li].objectives[oi] = fn(ls[li].objectives[oi])), ls))}
                    onRemove={() => update((ls) => ((ls[li].objectives = ls[li].objectives.filter((_, i) => i !== oi)), ls))}
                  />
                ))}
                {editable && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      update((ls) => (ls[li].objectives.push({ text: "", skill: null, required: true, needsReview: false, reviewNote: null, sourceQuote: null, questionIds: [] }), ls))
                    }
                  >
                    + Add objective
                  </Button>
                )}
              </section>
            ))}
            {editable && (
              <Button
                variant="secondary"
                onClick={() => update((ls) => [...ls, { number: (ls[ls.length - 1]?.number ?? 0) + 1, title: "", objectives: [] }])}
              >
                + Add {plan.unitLabel.toLowerCase()}
              </Button>
            )}
          </Card>

          <AssignCard
            comps={comps}
            assigned={data.assignedCompetitionIds}
            busy={busy}
            onSave={(ids) => run(() => api(`/api/host/plans/${id}/assign`, { method: "PUT", body: JSON.stringify({ competitionIds: ids }) }), "Assignments saved.")}
          />
        </>
      )}
    </div>
  );
}

function ObjectiveEditor({
  o,
  idx,
  editable,
  skills,
  bank,
  onChange,
  onRemove,
}: {
  o: Obj;
  idx: string;
  editable: boolean;
  skills: Skill[];
  bank: BankQ[];
  onChange: (fn: (o: Obj) => Obj) => void;
  onRemove: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [skillFilter, setSkillFilter] = useState<string>(o.skill ?? "all");
  const options = bank.filter((q) => skillFilter === "all" || q.skill === skillFilter);
  const byId = new Map(bank.map((q) => [q.id, q]));
  return (
    <div className={`rounded-xl p-3 space-y-2 ${o.needsReview ? "border-2 border-amber/60 bg-amber-soft/40" : "bg-cream-2/50"}`}>
      {o.needsReview && (
        <div className="flex flex-wrap items-start gap-2 justify-between">
          <p className="text-sm text-amber">
            <strong>⚠ Needs your review:</strong> {o.reviewNote ?? "Check this objective."}
          </p>
          {editable && (
            <Button variant="secondary" className="py-1 text-sm" onClick={() => onChange((x) => ({ ...x, needsReview: false, reviewNote: null }))}>
              Mark resolved
            </Button>
          )}
        </div>
      )}
      <Field label="Objective — students should be able to…" htmlFor={`ot-${idx}`}>
        <textarea id={`ot-${idx}`} className={`${inputCls} min-h-16`} value={o.text} disabled={!editable} onChange={(e) => onChange((x) => ({ ...x, text: e.target.value }))} />
      </Field>
      {o.sourceQuote && <p className="text-xs text-navy-soft">From your file: “{o.sourceQuote}”</p>}
      <div className="flex flex-wrap gap-3 items-end">
        <Field label="Skill" htmlFor={`os-${idx}`}>
          <select id={`os-${idx}`} className={`${inputCls} w-auto`} value={o.skill ?? ""} disabled={!editable} onChange={(e) => onChange((x) => ({ ...x, skill: e.target.value || null }))}>
            <option value="">(none)</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="inline-flex items-center gap-2 text-sm pb-3">
          <input type="checkbox" className="accent-violet" checked={o.required} disabled={!editable} onChange={(e) => onChange((x) => ({ ...x, required: e.target.checked }))} />
          Required
        </label>
        {editable && (
          <Button variant="danger" className="py-1.5 text-sm mb-1" onClick={onRemove}>
            Remove objective
          </Button>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          Mapped questions ({o.questionIds.length}){o.questionIds.length === 0 && <span className="font-normal text-navy-soft"> — students will see “Not assessed” and no practice</span>}
        </p>
        <ul className="space-y-1">
          {o.questionIds.map((qid) => (
            <li key={qid} className="flex items-start gap-2 text-sm">
              <span className="flex-1">
                <MathText text={byId.get(qid)?.prompt ?? qid} />
              </span>
              {editable && (
                <button className="text-rose underline text-xs" onClick={() => onChange((x) => ({ ...x, questionIds: x.questionIds.filter((q) => q !== qid) }))}>
                  Unmap
                </button>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <Button variant="ghost" className="py-1 text-sm" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
            {picking ? "Done mapping" : "+ Map verified questions"}
          </Button>
        )}
        {picking && (
          <div className="rounded-xl border border-line bg-white p-3 space-y-2">
            <label className="text-sm flex items-center gap-2">
              Show
              <select className={`${inputCls} w-auto py-1`} value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
                <option value="all">All skills</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <ul className="max-h-64 overflow-auto space-y-1">
              {options.map((q) => (
                <li key={q.id}>
                  <label className="flex gap-2 items-start text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 accent-violet"
                      checked={o.questionIds.includes(q.id)}
                      onChange={(e) =>
                        onChange((x) => ({ ...x, questionIds: e.target.checked ? [...x.questionIds, q.id] : x.questionIds.filter((id) => id !== q.id) }))
                      }
                    />
                    <span>
                      <MathText text={q.prompt} /> {q.questionRole === "follow-up" && <Badge tone="navy">follow-up</Badge>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaCard({ plan, onSave, busy }: { plan: PlanData["plan"]; onSave: (m: object) => void; busy: boolean }) {
  const [m, setM] = useState({ title: plan.title, subject: plan.subject, courseLabel: plan.courseLabel, description: plan.description, unitLabel: plan.unitLabel });
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Plan details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="mt">
          <input id="mt" className={inputCls} value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />
        </Field>
        <Field label="Grade or course" htmlFor="mc">
          <input id="mc" className={inputCls} value={m.courseLabel} onChange={(e) => setM({ ...m, courseLabel: e.target.value })} />
        </Field>
        <Field label="Units are called" htmlFor="mu">
          <select id="mu" className={inputCls} value={m.unitLabel} onChange={(e) => setM({ ...m, unitLabel: e.target.value as "Lecture" | "Lesson" })}>
            <option>Lecture</option>
            <option>Lesson</option>
          </select>
        </Field>
        <Field label="Subject" htmlFor="msub" hint="Changing subject may invalidate mapped questions.">
          <select id="msub" className={inputCls} value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value as PlanData["plan"]["subject"] })}>
            <option value="reading">Reading comprehension</option>
            <option value="math">Math</option>
            <option value="mixed">Both (mixed)</option>
          </select>
        </Field>
      </div>
      <Field label="Description" htmlFor="md">
        <textarea id="md" className={inputCls} value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} />
      </Field>
      <Button variant="secondary" disabled={busy} onClick={() => onSave(m)}>
        Save details
      </Button>
    </Card>
  );
}

function RuleCard({ rule, onSave, busy }: { rule: Rule; onSave: (r: Rule) => void; busy: boolean }) {
  const [r, setR] = useState<Rule>(rule);
  const min = Math.ceil(r.minDistinctQuestions / 2);
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">“Demonstrated in Rematch” rule</h2>
      <p className="text-sm text-navy-soft">An MVP progress rule to guide practice — not a validated educational standard or a grade. Choose from a small set of sensible options.</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.label} variant={JSON.stringify(p.rule) === JSON.stringify(r) ? "primary" : "secondary"} className="py-1.5 text-sm" onClick={() => setR(p.rule)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 items-end text-sm">
        <Field label="Different questions" htmlFor="rd">
          <select
            id="rd"
            className={`${inputCls} w-auto`}
            value={r.minDistinctQuestions}
            onChange={(e) => {
              const n = Number(e.target.value) as 2 | 3 | 4;
              setR({ ...r, minDistinctQuestions: n, minCorrectInRecent: Math.min(Math.max(r.minCorrectInRecent, Math.ceil(n / 2)), n) });
            }}
          >
            {[2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <Field label={`Correct of most recent ${r.minDistinctQuestions}`} htmlFor="rc">
          <select id="rc" className={`${inputCls} w-auto`} value={r.minCorrectInRecent} onChange={(e) => setR({ ...r, minCorrectInRecent: Number(e.target.value) })}>
            {Array.from({ length: r.minDistinctQuestions - min + 1 }, (_, i) => min + i).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
        <label className="inline-flex items-center gap-2 pb-3">
          <input type="checkbox" className="accent-violet" checked={r.requireLatestCorrect} onChange={(e) => setR({ ...r, requireLatestCorrect: e.target.checked })} />
          Most recent must be correct
        </label>
        <label className="inline-flex items-center gap-2 pb-3">
          <input type="checkbox" className="accent-violet" checked={r.requireTransferCorrect} onChange={(e) => setR({ ...r, requireTransferCorrect: e.target.checked })} />
          Needs one correct rematch/comeback question
        </label>
      </div>
      <Button variant="secondary" disabled={busy} onClick={() => onSave(r)}>
        Save rule
      </Button>
    </Card>
  );
}

function AssignCard({ comps, assigned, busy, onSave }: { comps: { id: string; title: string; subject: string; status: string }[]; assigned: string[]; busy: boolean; onSave: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(assigned);
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Assign to classrooms</h2>
      <p className="text-sm text-navy-soft">Students who joined any selected competition see this plan once it&apos;s published. Their progress is private to them and you.</p>
      {comps.length === 0 ? (
        <p className="text-sm">Create a competition first.</p>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2">
          {comps.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-violet" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
                {c.title} <span className="text-navy-soft">({c.status})</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => onSave(sel)}>
        Save assignments
      </Button>
    </Card>
  );
}

function Preview({ plan, lectures, bank }: { plan: PlanData["plan"]; lectures: Lec[]; bank: BankQ[] }) {
  return (
    <Card className="space-y-4">
      <Alert tone="violet">Student preview of this version. Statuses start at “Not assessed” until students answer mapped questions.</Alert>
      <h2 className="text-2xl font-bold">{plan.title}</h2>
      {lectures.map((l, i) => (
        <section key={i} className="rounded-2xl border border-line p-4">
          <p className="text-sm font-semibold text-violet-strong">
            {plan.unitLabel} {l.number}
          </p>
          <h3 className="text-lg font-bold">{l.title || "(untitled)"}</h3>
          <ul className="mt-2 space-y-2">
            {l.objectives.map((o, j) => (
              <li key={j} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cream-2/60 p-3">
                <span>{o.text || "(empty objective)"}</span>
                <span className="text-xs text-navy-soft">
                  ○ Not assessed · {o.questionIds.filter((q) => bank.some((b) => b.id === q)).length ? `${o.questionIds.length} practice question(s)` : "no practice yet"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Card>
  );
}
