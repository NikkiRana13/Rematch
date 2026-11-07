"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { HostGate } from "@/components/HostGate";
import { api, post } from "@/components/fetcher";
import { MathText } from "@/components/MathText";
import { Alert, Badge, Button, Card, EmptyState, Spinner, StatusBadge, SubjectBadge, inputCls } from "@/components/ui";

interface Ratio {
  numerator: number;
  denominator: number;
  rate: number | null;
}
type Source = "ai" | "rule-based" | "host-override" | "synthetic" | "unavailable";
interface Results {
  competition: { id: string; title: string; subject: "reading" | "math"; status: "draft" | "open" | "closed"; roomCode: string; isDemoData: boolean };
  analytics: {
    participantCount: number;
    completion: Ratio;
    skillAccuracy: { skill: string; accuracy: Ratio; distinctQuestions: number; limitedEvidence: boolean }[];
    questionAccuracy: { questionId: string; accuracy: Ratio }[];
    comebackSuccess: Ratio;
    comebackPoints: number;
    initialPoints: number;
    misconceptions: { category: string; participants: Ratio; evidence: { attemptId: string; participantNickname: string; quote: string | null; source: Source }[] }[];
    reviewCases: { attemptId: string; participantNickname: string; questionId: string; kind: string; reason: string; reasoning: string; clarificationText: string | null; category: string | null }[];
    readAloud: { used: Ratio; accuracyWith: Ratio; accuracyWithout: Ratio } | null;
    analysisSources: Record<string, number>;
    unavailableAnalyses: number;
    includesSyntheticData: boolean;
  };
  responses: {
    attemptId: string;
    nickname: string;
    synthetic: boolean;
    kind: "initial" | "comeback";
    prompt: string;
    skill: string;
    selectedAnswer: string;
    isCorrect: boolean;
    points: number;
    reasoning: string;
    reasoningStatus: string;
    clarificationText: string | null;
    readAloudUsed: boolean;
    analysis: { status: string; provider: string | null; model: string | null; promptVersion: string | null; category: string | null; evidenceQuote: string | null; explanation: string | null; errorCode: string | null; synthetic: boolean } | null;
    effective: { category: string | null; overridden: boolean; originalCategory: string | null; source: Source };
    createdAt: string;
  }[];
  questions: { id: string; prompt: string; skill: string | null }[];
  insight: {
    provider: string;
    model: string | null;
    status: "completed" | "unavailable";
    createdAt: string;
    payload: {
      source: "ai" | "rule-based";
      summary: string;
      observations: { text: string; evidenceIds: string[] }[];
      suggestions: { interventionId: string; whyItMayFit: string }[];
      caveats: string[];
      errorCode?: string | null;
    };
  } | null;
  assignments: { id: string; interventionId: string; source: string; createdAt: string }[];
  interventions: { id: string; title: string; description: string; steps: string[]; durationMinutes: number }[];
  aiConfigured: boolean;
  generatedAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  UNSUPPORTED_INFERENCE: "Unsupported inference",
  EXPLICIT_STATEMENT_REQUIRED: "Expects the answer to be stated directly",
  LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT: "Larger denominator means larger amount",
  SAME_NUMERATOR_MEANS_EQUAL_AMOUNT: "Same numerator means equal amount",
  SLIP_WITH_CORRECT_METHOD: "Slip with correct method",
  OTHER_MISCONCEPTION: "Other misconception",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  NO_MISCONCEPTION_DETECTED: "No misconception detected",
};
const SUBJECT_CATS: Record<"reading" | "math", string[]> = {
  reading: ["UNSUPPORTED_INFERENCE", "EXPLICIT_STATEMENT_REQUIRED"],
  math: ["LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT"],
};
const SHARED = ["SLIP_WITH_CORRECT_METHOD", "OTHER_MISCONCEPTION", "INSUFFICIENT_EVIDENCE", "NO_MISCONCEPTION_DETECTED"];
const SKILL_LABEL: Record<string, string> = {
  "reading.main_idea": "Main idea",
  "reading.inference": "Inference",
  "reading.vocabulary_in_context": "Vocabulary in context",
  "reading.supporting_evidence": "Supporting evidence",
  "math.place_value": "Place value",
  "math.addition_subtraction": "Addition and subtraction",
  "math.multiplication_division": "Multiplication and division",
  "math.fractions_intro": "Introductory fractions",
};

const pct = (r: Ratio) => (r.rate === null ? "—" : `${Math.round(r.rate * 100)}%`);
const frac = (r: Ratio) => `${r.numerator} of ${r.denominator}`;

function SourceBadge({ source }: { source: Source }) {
  const map: Record<Source, [string, "violet" | "navy" | "amber" | "green" | "rose"]> = {
    ai: ["AI analysis", "violet"],
    "rule-based": ["Rule-based", "navy"],
    "host-override": ["Your override", "green"],
    synthetic: ["Demo data", "amber"],
    unavailable: ["Analysis unavailable", "rose"],
  };
  const [label, tone] = map[source];
  return <Badge tone={tone}>{label}</Badge>;
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <HostGate>{() => <Dashboard id={id} />}</HostGate>;
}

function StatTile({ label, ratio, hint }: { label: string; ratio?: Ratio; value?: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-navy-soft font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{ratio ? pct(ratio) : "—"}</p>
      <p className="text-sm">{ratio ? frac(ratio) : ""}</p>
      <p className="text-xs text-navy-soft mt-1">{hint}</p>
    </div>
  );
}

function AccuracyBar({ ratio, label }: { ratio: Ratio; label: string }) {
  const w = Math.round((ratio.rate ?? 0) * 100);
  return (
    <div className="h-3 w-full rounded bg-cream-2" role="img" aria-label={`${label}: ${pct(ratio)}, ${frac(ratio)}`} title={`${label}: ${frac(ratio)}`}>
      {ratio.rate !== null && <div className="h-full rounded-r bg-violet transition-[width] duration-500" style={{ width: `${Math.max(w, 1)}%` }} />}
    </div>
  );
}

function Dashboard({ id }: { id: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const r = await api<Results>(`/api/host/competitions/${id}/results`);
      setData(r);
      setUpdated(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Polling keeps the dashboard live as students submit (realtime not required).
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const qPrompt = useMemo(() => new Map(data?.questions.map((q) => [q.id, q.prompt]) ?? []), [data]);

  if (!data) return error ? <Alert tone="rose" role="alert" title="Couldn't load results">{error}</Alert> : <Spinner label="Loading results" />;
  const { competition: c, analytics: a } = data;
  const responses = data.responses.filter((r) => skillFilter === "all" || r.skill === skillFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Link href="/host" className="text-sm underline">
            ← Host dashboard
          </Link>
          <div className="flex flex-wrap gap-2">
            <SubjectBadge subject={c.subject} />
            <StatusBadge status={c.status} />
            {c.isDemoData && <Badge tone="amber">Demonstration data</Badge>}
          </div>
          <h1 className="text-3xl font-bold">{c.title}</h1>
        </div>
        {c.status === "open" && (
          <div className="rounded-2xl bg-navy text-white px-5 py-3 text-center">
            <p className="text-xs uppercase tracking-wide opacity-80">Room code</p>
            <p className="text-3xl font-bold tracking-[0.25em]">{c.roomCode}</p>
          </div>
        )}
      </div>
      <p className="text-xs text-navy-soft" aria-live="polite">
        Updates every 5 seconds · last updated {updated}
        {error && <span className="text-rose"> · Couldn&apos;t refresh: {error}</span>}
      </p>

      {a.includesSyntheticData && (
        <Alert tone="amber" title="Demonstration data">
          This competition contains fictional participants and synthetic responses generated to demonstrate the dashboard. It does not describe real students.
        </Alert>
      )}

      {a.participantCount === 0 ? (
        <EmptyState title="No participants yet">
          {c.status === "open" ? (
            <p>
              Share room code <strong>{c.roomCode}</strong>. Students join at <strong>/join</strong>. This page updates as answers arrive.
            </p>
          ) : (
            <p>Launch the competition to collect responses.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="text-sm text-navy-soft font-medium">Participants</p>
              <p className="text-3xl font-bold mt-1">{a.participantCount}</p>
              <p className="text-xs text-navy-soft mt-1">Joined this competition</p>
            </div>
            <StatTile label="Completed the sprint" ratio={a.completion} hint="Participants who answered every initial question" />
            <StatTile label="Comeback success" ratio={a.comebackSuccess} hint="Correct comeback answers / comeback questions completed" />
            <div className="rounded-2xl border border-line bg-white p-4">
              <p className="text-sm text-navy-soft font-medium">Points awarded</p>
              <p className="text-xl font-bold mt-1">{a.initialPoints} first-try</p>
              <p className="text-xl font-bold text-green">{a.comebackPoints} comeback</p>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="text-xl font-bold">Skill accuracy (first attempts)</h2>
              <p className="text-xs text-navy-soft mb-4">Correct first attempts / all first attempts. Comebacks are excluded. Simple accuracy, not a mastery score.</p>
              <ul className="space-y-4">
                {a.skillAccuracy.map((s) => (
                  <li key={s.skill}>
                    <div className="flex justify-between text-sm mb-1 gap-2">
                      <span className="font-semibold">{SKILL_LABEL[s.skill] ?? s.skill}</span>
                      <span>
                        <strong>{pct(s.accuracy)}</strong> ({frac(s.accuracy)} answers)
                      </span>
                    </div>
                    <AccuracyBar ratio={s.accuracy} label={SKILL_LABEL[s.skill] ?? s.skill} />
                    {s.limitedEvidence && (
                      <p className="text-xs text-amber mt-1">
                        ⚠ Limited evidence: {s.distinctQuestions} distinct question{s.distinctQuestions === 1 ? "" : "s"} (MVP display rule: fewer than 3)
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold">By question</summary>
                <ul className="mt-2 space-y-2 text-sm">
                  {a.questionAccuracy.map((q, i) => (
                    <li key={q.questionId} className="flex justify-between gap-3">
                      <span>
                        Q{i + 1}. <MathText text={qPrompt.get(q.questionId) ?? ""} />
                      </span>
                      <span className="shrink-0">{frac(q.accuracy)} correct</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Card>

            <Card>
              <h2 className="text-xl font-bold">Likely misconceptions</h2>
              <p className="text-xs text-navy-soft mb-4">
                Distinct participants with a classification supported by a quote from their own reasoning, out of participants whose reasoning was analysed. These are
                likely explanations, not diagnoses — review the excerpts.
              </p>
              {a.misconceptions.length === 0 ? (
                <p className="text-sm text-navy-soft">No supported misconception patterns yet.</p>
              ) : (
                <ul className="space-y-5">
                  {a.misconceptions.map((m) => (
                    <li key={m.category}>
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="font-semibold">{CATEGORY_LABEL[m.category] ?? m.category}</span>
                        <span>{frac(m.participants)} participants</span>
                      </div>
                      <ul className="mt-2 space-y-1.5">
                        {m.evidence.slice(0, 4).map((e) => (
                          <li key={e.attemptId} className="text-sm rounded-lg bg-cream-2/70 px-3 py-2 flex flex-wrap gap-2 items-center">
                            <span className="italic">“{e.quote ?? "(teacher override, no quote)"}”</span>
                            <span className="text-navy-soft">— {e.participantNickname}</span>
                            <SourceBadge source={e.source} />
                          </li>
                        ))}
                        {m.evidence.length > 4 && <li className="text-xs text-navy-soft">+{m.evidence.length - 4} more in responses below</li>}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-navy-soft mt-4">
                Analysis sources:{" "}
                {Object.entries(a.analysisSources)
                  .map(([k, v]) => `${k} (${v})`)
                  .join(", ") || "none"}
                {a.unavailableAnalyses > 0 && ` · ${a.unavailableAnalyses} unavailable`}
              </p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="text-xl font-bold">Needs your review ({a.reviewCases.length})</h2>
              <p className="text-xs text-navy-soft mb-3">Clarification requests, unclear or out-of-scope reasoning, and unavailable analyses.</p>
              {a.reviewCases.length === 0 ? (
                <p className="text-sm text-navy-soft">Nothing flagged.</p>
              ) : (
                <ul className="space-y-2 max-h-96 overflow-auto pr-1">
                  {a.reviewCases.map((r) => (
                    <li key={r.attemptId} className="rounded-xl border border-line p-3 text-sm space-y-1">
                      <div className="flex flex-wrap gap-2 items-center">
                        <strong>{r.participantNickname}</strong>
                        <Badge tone={r.kind === "analysis_unavailable" ? "rose" : r.kind === "clarification" ? "violet" : "amber"}>{r.reason.replaceAll("_", " ")}</Badge>
                      </div>
                      <p>
                        Reasoning: <q>{r.reasoning || "(none given)"}</q>
                      </p>
                      {r.clarificationText && (
                        <p>
                          Clarification: <q>{r.clarificationText}</q>
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {a.readAloud && (
              <Card>
                <h2 className="text-xl font-bold">Read-aloud context</h2>
                <p className="text-sm mt-2">
                  Read-aloud was used on <strong>{frac(a.readAloud.used)}</strong> reading first attempts.
                </p>
                <ul className="text-sm mt-2 space-y-1">
                  <li>With read-aloud: {frac(a.readAloud.accuracyWith)} correct</li>
                  <li>Without read-aloud: {frac(a.readAloud.accuracyWithout)} correct</li>
                </ul>
                <p className="text-xs text-navy-soft mt-3">
                  Context for interpreting reading results only (e.g. decoding vs. comprehension). Read-aloud use does not diagnose or indicate any disability.
                </p>
              </Card>
            )}
          </div>

          <InsightPanel data={data} onChange={load} />
        </>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-bold">Responses</h2>
          <label className="text-sm flex items-center gap-2">
            Skill
            <select className={`${inputCls} w-auto py-1.5`} value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)}>
              <option value="all">All skills</option>
              {[...new Set(data.responses.map((r) => r.skill))].map((s) => (
                <option key={s} value={s}>
                  {SKILL_LABEL[s] ?? s}
                </option>
              ))}
            </select>
          </label>
        </div>
        {responses.length === 0 ? (
          <p className="text-sm text-navy-soft">No responses yet.</p>
        ) : (
          <ul className="space-y-3">
            {responses.map((r) => (
              <ResponseRow key={r.attemptId} r={r} subject={c.subject} onChange={load} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ResponseRow({ r, subject, onChange }: { r: Results["responses"][number]; subject: "reading" | "math"; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [cat, setCat] = useState(r.effective.category ?? "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <li className="rounded-2xl border border-line p-4 space-y-2 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <strong>{r.nickname}</strong>
        <Badge tone={r.kind === "comeback" ? "green" : "navy"}>{r.kind === "comeback" ? "Comeback" : "First attempt"}</Badge>
        {r.isCorrect ? <Badge tone="green">Correct (+{r.points})</Badge> : <Badge tone="amber">Incorrect ({r.selectedAnswer})</Badge>}
        {r.readAloudUsed && <Badge tone="violet">Read-aloud used</Badge>}
        {r.synthetic && <Badge tone="amber">Synthetic</Badge>}
      </div>
      <p className="text-navy-soft">
        <MathText text={r.prompt} />
      </p>
      <p>
        <span className="font-semibold">Reasoning:</span>{" "}
        {r.reasoningStatus === "provided" ? <q>{r.reasoning}</q> : <em>{r.reasoningStatus === "not_sure" ? "“I'm not sure”" : "skipped"}</em>}
      </p>
      {r.clarificationText && (
        <p>
          <span className="font-semibold">Clarification:</span> <q>{r.clarificationText}</q>
        </p>
      )}
      {r.analysis && (
        <div className="rounded-xl bg-cream-2/60 p-3 space-y-1">
          <div className="flex flex-wrap gap-2 items-center">
            <SourceBadge source={r.effective.source} />
            {r.analysis.status === "completed" ? (
              <span>
                Likely: <strong>{CATEGORY_LABEL[r.effective.category ?? ""] ?? "—"}</strong>
                {r.effective.overridden && <span className="text-navy-soft"> (original: {CATEGORY_LABEL[r.effective.originalCategory ?? ""] ?? "—"})</span>}
              </span>
            ) : (
              <span>Analysis unavailable ({r.analysis.errorCode}). No classification was made.</span>
            )}
          </div>
          {r.analysis.evidenceQuote && (
            <p>
              Evidence: <mark className="bg-violet-soft rounded px-1">“{r.analysis.evidenceQuote}”</mark>
            </p>
          )}
          {r.analysis.explanation && <p className="text-navy-soft">{r.analysis.explanation}</p>}
          {r.analysis.provider && (
            <p className="text-xs text-navy-soft">
              {r.analysis.provider}
              {r.analysis.model ? ` · ${r.analysis.model}` : ""} · prompt {r.analysis.promptVersion}
            </p>
          )}
          {r.analysis.status === "completed" && (
            <div>
              {!editing ? (
                <button className="text-xs underline" onClick={() => setEditing(true)}>
                  Override classification
                </button>
              ) : (
                <form
                  className="flex flex-wrap gap-2 items-end mt-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await post(`/api/host/attempts/${r.attemptId}/override`, { category: cat, note });
                      setEditing(false);
                      onChange();
                    } catch (e2) {
                      setErr((e2 as Error).message);
                    }
                  }}
                >
                  <label className="text-xs">
                    Category
                    <select className={`${inputCls} py-1`} value={cat} onChange={(e) => setCat(e.target.value)}>
                      {[...SUBJECT_CATS[subject], ...SHARED].map((k) => (
                        <option key={k} value={k}>
                          {CATEGORY_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs flex-1 min-w-40">
                    Note (optional)
                    <input className={`${inputCls} py-1`} value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <Button type="submit" className="py-1.5">
                    Save
                  </Button>
                  <Button type="button" variant="ghost" className="py-1.5" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <p className="text-xs text-navy-soft w-full">The original analysis is kept; your override is stored separately.</p>
                  {err && <p className="text-xs text-rose w-full">{err}</p>}
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function InsightPanel({ data, onChange }: { data: Results; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ins = data.insight;
  const byId = new Map(data.interventions.map((i) => [i.id, i]));
  const assigned = new Set(data.assignments.map((x) => x.interventionId));
  const evidence = useMemo(() => {
    const out: { id: string; quote: string }[] = [];
    for (const m of data.analytics.misconceptions) for (const e of m.evidence.filter((x) => x.quote).slice(0, 4)) out.push({ id: `e${out.length + 1}`, quote: e.quote! });
    return new Map(out.map((e) => [e.id, e.quote]));
  }, [data]);

  return (
    <Card className="border-violet/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Teacher insight & suggested activities</h2>
          <p className="text-xs text-navy-soft">
            Built from the computed metrics above and de-identified excerpts. {data.aiConfigured ? "Uses AI when available." : "AI is not configured: suggestions are rule-based."} Nothing is assigned
            without your review.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await post(`/api/host/competitions/${data.competition.id}/insight`);
              onChange();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Generating…" : ins ? "Regenerate insight" : "Generate insight"}
        </Button>
      </div>
      {err && <Alert tone="rose" role="alert">{err}</Alert>}
      {ins && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {ins.payload.source === "ai" ? <Badge tone="violet">AI-written · {ins.model}</Badge> : <Badge tone="navy">Rule-based suggestions</Badge>}
            {ins.status === "unavailable" && <Badge tone="rose">AI unavailable ({ins.payload.errorCode}) — showing rule-based instead</Badge>}
            <span className="text-xs text-navy-soft">{new Date(ins.createdAt).toLocaleString()}</span>
          </div>
          <p>{ins.payload.summary}</p>
          {ins.payload.observations.length > 0 && (
            <ul className="space-y-2">
              {ins.payload.observations.map((o, i) => (
                <li key={i} className="text-sm">
                  • {o.text}
                  {o.evidenceIds.length > 0 && (
                    <span className="block text-xs text-navy-soft pl-3">
                      Evidence: {o.evidenceIds.map((eid) => (evidence.get(eid) ? `“${evidence.get(eid)}”` : eid)).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {ins.payload.suggestions.map((s) => {
              const iv = byId.get(s.interventionId);
              if (!iv) return null;
              return (
                <div key={s.interventionId} className="rounded-2xl border border-line p-4 space-y-2">
                  <p className="font-bold">
                    {iv.title} <span className="text-xs font-normal text-navy-soft">· ~{iv.durationMinutes} min</span>
                  </p>
                  <p className="text-sm">{iv.description}</p>
                  <p className="text-sm text-navy-soft">
                    <strong>Why it may fit:</strong> {s.whyItMayFit}
                  </p>
                  <details>
                    <summary className="text-sm cursor-pointer">Steps</summary>
                    <ol className="list-decimal pl-5 text-sm mt-1">
                      {iv.steps.map((st) => (
                        <li key={st}>{st}</li>
                      ))}
                    </ol>
                  </details>
                  {assigned.has(iv.id) ? (
                    <Badge tone="green">✓ Assigned after your review</Badge>
                  ) : (
                    <Button
                      variant="success"
                      className="py-1.5 text-sm"
                      onClick={async () => {
                        try {
                          await post(`/api/host/competitions/${data.competition.id}/interventions`, {
                            interventionId: iv.id,
                            rationale: s.whyItMayFit,
                            source: ins.payload.source,
                          });
                          onChange();
                        } catch (e) {
                          setErr((e as Error).message);
                        }
                      }}
                    >
                      I&apos;ve reviewed this — assign
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <ul className="text-xs text-navy-soft list-disc pl-5">
            {ins.payload.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
