"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, post } from "@/components/fetcher";
import { MathText } from "@/components/MathText";
import { fmtDate, KIND_LABEL, ProgressBar, RuleNote, StatusPill, statusLabel, type ObjectiveStatus } from "@/components/roadmap";
import { Alert, Badge, Button, Card, EmptyState, Field, LinkButton, Spinner, inputCls } from "@/components/ui";

interface Evidence {
  attemptId: string;
  questionId: string;
  question: string;
  kind: string;
  isCorrect: boolean;
  independent: boolean;
  createdAt: string;
  counted: boolean;
  note: string;
}
interface Objective {
  id: string;
  text: string;
  skillLabel: string | null;
  required: boolean;
  practiceAvailable: boolean;
  progress: {
    status: ObjectiveStatus;
    computedStatus: ObjectiveStatus;
    override: { status: ObjectiveStatus; reason: string; createdAt: string } | null;
    mappedQuestionCount: number;
    distinctQuestions: number;
    recentCorrect: number;
    recent: unknown[];
    transferCorrect: number;
    supportedPractice: number;
    excludedAttempts: number;
    lastActivity: string | null;
    reasons: string[];
    evidence: Evidence[];
  };
}
interface Lecture {
  id: string;
  number: number;
  title: string;
  status: ObjectiveStatus;
  demonstrated: number;
  required: number;
  lastActivity: string | null;
  objectives: Objective[];
}
interface Roadmap {
  plan: { id: string; title: string; courseLabel: string; description: string; unitLabel: string; isDemoData: boolean; version: number };
  ruleText: string;
  overall: { demonstrated: number; total: number };
  lectures: Lecture[];
  nextStep: { objectiveId: string; practiceResourceId: string | null; practiceTitle: string | null; reason: string } | null;
  recent: { attemptId: string; kind: string; question: string; isCorrect: boolean; points: number; independent: boolean; createdAt: string; objectiveIds: string[]; likelyIdea: string | null }[];
}
interface PlanSummary {
  id: string;
  title: string;
  courseLabel: string;
  unitLabel: string;
  isDemoData: boolean;
  overall: { demonstrated: number; total: number };
}
interface Guide {
  source: "ai" | "rule-based";
  summary: string;
  strengths: { objectiveId: string; explanation: string; evidenceAttemptIds: string[] }[];
  practiceNeeds: { objectiveId: string; explanation: string; evidenceAttemptIds: string[] }[];
  recommendedNextStep: { objectiveId: string; practiceResourceId: string | null; explanation: string } | null;
  limitations: string[];
  errorCode?: string | null;
}

export default function RoadmapPage() {
  return (
    <Suspense fallback={<Spinner label="Loading your roadmap" />}>
      <RoadmapInner />
    </Suspense>
  );
}

function RoadmapInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const planId = params.get("plan") ?? plans?.[0]?.id ?? null;

  const loadPlans = useCallback(async () => {
    try {
      setError(null);
      setPlans((await api<{ plans: PlanSummary[] }>("/api/roadmap")).plans);
    } catch (e) {
      setError(e as ApiError);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlans();
  }, [loadPlans]);

  if (error?.status === 401) return <NoLearner onResumed={loadPlans} />;
  if (error) return <Alert tone="rose" role="alert" title="Couldn't load your roadmap">{error.message}</Alert>;
  if (!plans) return <Spinner label="Loading your roadmap" />;
  if (!plans.length)
    return (
      <EmptyState title="No learning plan yet">
        <p>When your teacher assigns a learning plan to your class, your roadmap will appear here.</p>
        <LinkButton href="/me" variant="secondary" className="mt-4">
          My sprints
        </LinkButton>
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">My Learning Roadmap</h1>
          <p className="text-navy-soft">Private to you and your teacher. No rankings, no timers.</p>
        </div>
        {plans.length > 1 && (
          <label className="text-sm font-semibold flex items-center gap-2">
            Plan
            <select className={`${inputCls} w-auto py-2`} value={planId ?? ""} onChange={(e) => router.replace(`/roadmap?plan=${e.target.value}`)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.overall.demonstrated}/{p.overall.total})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {planId && <PlanRoadmap key={planId} planId={planId} />}
    </div>
  );
}

function NoLearner({ onResumed }: { onResumed: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [demo, setDemo] = useState<{ id: string; nickname: string }[]>([]);
  useEffect(() => {
    api<{ learners: { id: string; nickname: string }[] }>("/api/auth/demo-learner").then((r) => setDemo(r.learners)).catch(() => {});
  }, []);
  return (
    <Card className="max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">My Learning Roadmap</h1>
      <p className="text-navy-soft">Join a sprint with a room code to see your roadmap, or use your private resume code to continue from another device.</p>
      <LinkButton href="/join">Join with a room code</LinkButton>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post("/api/learner/resume", { code });
            onResumed();
          } catch (e2) {
            setErr((e2 as Error).message);
          }
        }}
      >
        <Field label="Resume code" htmlFor="resume" hint="12 letters and numbers, like ABCD-EFGH-JK23. Keep it private.">
          <input id="resume" className={`${inputCls} uppercase tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </Field>
        {err && <Alert tone="rose" role="alert">{err}</Alert>}
        <Button type="submit" variant="secondary" disabled={code.replace(/[^a-z0-9]/gi, "").length < 12}>
          Continue with code
        </Button>
      </form>
      {demo.length > 0 && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-sm font-semibold">Local demo: view as a fictional student</p>
          <div className="flex flex-wrap gap-2">
            {demo.map((d) => (
              <Button key={d.id} variant="ghost" onClick={() => post("/api/auth/demo-learner", { learnerId: d.id }).then(onResumed)}>
                {d.nickname}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function PlanRoadmap({ planId }: { planId: string }) {
  const [r, setR] = useState<Roadmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A counter makes every "Ask why" click a new request, even for the same objective.
  const [whyRequest, setWhyRequest] = useState<{ objectiveId: string; n: number } | null>(null);
  const askWhy = useCallback((objectiveId: string) => setWhyRequest((prev) => ({ objectiveId, n: (prev?.n ?? 0) + 1 })), []);
  useEffect(() => {
    api<Roadmap>(`/api/roadmap/${planId}`)
      .then(setR)
      .catch((e) => setError((e as Error).message));
  }, [planId]);
  if (error) return <Alert tone="rose" role="alert" title="Couldn't load this plan">{error}</Alert>;
  if (!r) return <Spinner label="Working out your progress" />;
  const objectives = r.lectures.flatMap((l) => l.objectives.map((o) => ({ ...o, lecture: l })));
  const next = r.nextStep ? objectives.find((o) => o.id === r.nextStep!.objectiveId) : null;
  const objText = (id: string) => objectives.find((o) => o.id === id)?.text ?? "an objective";

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap gap-2 mb-1">
          {r.plan.courseLabel && <Badge tone="navy">{r.plan.courseLabel}</Badge>}
          {r.plan.isDemoData && <Badge tone="amber">Demonstration data</Badge>}
        </div>
        <h2 className="text-2xl font-bold">{r.plan.title}</h2>
        {r.plan.description && <p className="text-navy-soft mt-1">{r.plan.description}</p>}
        <div className="mt-4 space-y-2">
          <p className="text-lg">
            <strong>
              {r.overall.demonstrated} of {r.overall.total}
            </strong>{" "}
            objectives demonstrated in Rematch
          </p>
          <ProgressBar value={r.overall.demonstrated} max={r.overall.total} label="Objectives demonstrated" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <Card className="border-violet/30">
          <h2 className="text-xl font-bold">Your next step</h2>
          {next && r.nextStep ? (
            <div className="space-y-3 mt-2">
              <p className="font-semibold reading-text">{next.text}</p>
              <p className="text-sm text-navy-soft">
                {r.plan.unitLabel} {next.lecture.number}: {next.lecture.title} · <StatusPill status={next.progress.status} small />
              </p>
              <p className="text-sm">{r.nextStep.reason}</p>
              <p className="text-xs text-navy-soft">Suggested by a simple rule: practise what needs it most, in plan order.</p>
              <LinkButton href={`/roadmap/${planId}/practice/${next.id}`}>Rematch this objective</LinkButton>
            </div>
          ) : (
            <p className="text-navy-soft mt-2">
              {r.overall.total > 0 && r.overall.demonstrated === r.overall.total
                ? "Every objective is demonstrated in Rematch. Nice work! 🎉"
                : "There's no practice available for the remaining objectives yet. Your teacher can add some."}
            </p>
          )}
        </Card>
        <ExplainPanel planId={planId} roadmap={r} whyRequest={whyRequest} objText={objText} />
      </div>

      <RuleNote ruleText={r.ruleText} />

      <section aria-labelledby="lectures-h" className="space-y-3">
        <h2 id="lectures-h" className="text-xl font-bold">
          {r.plan.unitLabel}s
        </h2>
        {r.lectures.map((l) => (
          <LectureCard key={l.id} planId={planId} unitLabel={r.plan.unitLabel} lecture={l} onExplain={askWhy} />
        ))}
      </section>

      <Card>
        <h2 className="text-xl font-bold mb-3">Recent activity</h2>
        {r.recent.length === 0 ? (
          <p className="text-sm text-navy-soft">No answers yet. Your first sprint or rematch will show up here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {r.recent.map((a) => (
              <li key={a.attemptId} className="py-3 flex flex-wrap items-start gap-2 justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={a.kind === "initial" ? "navy" : "green"}>{KIND_LABEL[a.kind] ?? a.kind}</Badge>
                    {a.isCorrect ? <Badge tone="green">✓ Correct</Badge> : <Badge tone="amber">Still learning</Badge>}
                    {a.points > 0 && <Badge tone="violet">+{a.points} pts</Badge>}
                    {!a.independent && <Badge tone="navy">Seen before — practice only</Badge>}
                  </div>
                  <p className="text-sm">
                    <MathText text={a.question} />
                  </p>
                  {a.likelyIdea && <p className="text-xs text-navy-soft">Possible idea to check: {a.likelyIdea}</p>}
                </div>
                <span className="text-xs text-navy-soft">{fmtDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LectureCard({ planId, unitLabel, lecture, onExplain }: { planId: string; unitLabel: string; lecture: Lecture; onExplain: (id: string) => void }) {
  const [open, setOpen] = useState(lecture.status === "needs_practice" || lecture.status === "in_progress");
  const target = lecture.objectives.find((o) => o.practiceAvailable && o.progress.status !== "demonstrated");
  const action = !target ? null : target.progress.status === "needs_practice" ? "Practise" : target.progress.status === "in_progress" ? "Continue" : "Start";
  return (
    <Card className="p-0 sm:p-0 overflow-hidden">
      <div className="p-5 flex flex-wrap items-center gap-3 justify-between">
        <button type="button" aria-expanded={open} aria-controls={`lec-${lecture.id}`} onClick={() => setOpen((v) => !v)} className="text-left flex-1 min-w-56">
          <span className="block text-sm font-semibold text-violet-strong">
            {unitLabel} {lecture.number} <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          </span>
          <span className="block text-lg font-bold">{lecture.title}</span>
          <span className="block text-sm text-navy-soft">
            {lecture.demonstrated} of {lecture.required} required objectives · last activity {fmtDate(lecture.lastActivity)}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={lecture.status} />
          {target && action && <LinkButton href={`/roadmap/${planId}/practice/${target.id}`} variant="secondary" className="py-1.5">{action}</LinkButton>}
        </div>
      </div>
      <div className="px-5 pb-1">
        <ProgressBar value={lecture.demonstrated} max={lecture.required} label={`${unitLabel} ${lecture.number} objectives demonstrated`} />
      </div>
      {open && (
        <ul id={`lec-${lecture.id}`} className="p-5 space-y-3">
          {lecture.objectives.map((o) => (
            <ObjectiveRow key={o.id} planId={planId} o={o} onExplain={onExplain} />
          ))}
        </ul>
      )}
      {!open && <div className="h-4" />}
    </Card>
  );
}

function ObjectiveRow({ planId, o, onExplain }: { planId: string; o: Objective; onExplain: (id: string) => void }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const p = o.progress;
  return (
    <li className="rounded-2xl border border-line p-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-semibold reading-text flex-1 min-w-56">
          {o.text} {!o.required && <Badge tone="navy">Optional</Badge>}
        </p>
        <StatusPill status={p.status} small />
      </div>
      <p className="text-sm text-navy-soft">
        {p.distinctQuestions} different question{p.distinctQuestions === 1 ? "" : "s"} counted · {p.transferCorrect} correct rematch
        {p.transferCorrect === 1 ? "" : "es"} · {p.supportedPractice} practice card{p.supportedPractice === 1 ? "" : "s"} · last {fmtDate(p.lastActivity)}
      </p>
      {p.override && (
        <Alert tone="violet">
          Your teacher set this to <strong>{statusLabel(p.override.status)}</strong>: “{p.override.reason}”. (Calculated from your answers: {statusLabel(p.computedStatus)}.)
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        {o.practiceAvailable ? (
          <LinkButton href={`/roadmap/${planId}/practice/${o.id}`} className="py-1.5 text-sm">
            Rematch this objective
          </LinkButton>
        ) : (
          <span className="text-sm text-navy-soft">Your teacher hasn&apos;t added practice for this objective yet.</span>
        )}
        <Button variant="ghost" className="py-1.5 text-sm" aria-expanded={showEvidence} onClick={() => setShowEvidence((v) => !v)}>
          {showEvidence ? "Hide evidence" : "See evidence"}
        </Button>
        {p.status !== "not_assessed" && (
          <Button variant="ghost" className="py-1.5 text-sm" onClick={() => onExplain(o.id)}>
            Ask why
          </Button>
        )}
      </div>
      {showEvidence && (
        <div className="rounded-xl bg-cream-2/60 p-3 space-y-2 text-sm">
          <ul className="list-disc pl-5">
            {p.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {p.evidence.length === 0 ? (
            <p className="text-navy-soft">No answers on this objective&apos;s questions yet.</p>
          ) : (
            <ul className="space-y-2">
              {p.evidence.map((e) => (
                <li key={e.attemptId} className="rounded-lg bg-white p-2">
                  <p>
                    <MathText text={e.question} />
                  </p>
                  <p className="text-xs text-navy-soft mt-1 flex flex-wrap gap-x-3">
                    <span>{KIND_LABEL[e.kind] ?? e.kind}</span>
                    <span>{e.isCorrect ? "✓ Correct" : "✗ Not yet"}</span>
                    <span>{fmtDate(e.createdAt)}</span>
                    <span>{e.counted ? "Counted as evidence" : `Not counted — ${e.note.replace(/\.$/, "")}`}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ExplainPanel({
  planId,
  roadmap,
  whyRequest,
  objText,
}: {
  planId: string;
  roadmap: Roadmap;
  whyRequest: { objectiveId: string; n: number } | null;
  objText: (id: string) => string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const focusObjective = whyRequest?.objectiveId ?? null;
  const [guide, setGuide] = useState<Guide | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const readyLecture = roadmap.lectures.find((l) => l.status !== "demonstrated") ?? roadmap.lectures[roadmap.lectures.length - 1];
  const readyLectureId = readyLecture?.id ?? null;
  const whyObjective =
    focusObjective ?? roadmap.lectures.flatMap((l) => l.objectives).find((o) => o.progress.status === "needs_practice" || o.progress.status === "in_progress")?.id ?? null;

  const ask = useCallback(
    async (kind: "ready" | "next" | "why", objectiveId?: string | null) => {
      setBusy(kind);
      setErr(null);
      try {
        const r = await post<{ guide: Guide }>(`/api/roadmap/${planId}/explain`, { ask: kind, lectureId: kind === "ready" ? readyLectureId : null, objectiveId: objectiveId ?? null });
        setGuide(r.guide);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [planId, readyLectureId],
  );

  useEffect(() => {
    // "Ask why" on an objective: bring the panel into view and explain that objective.
    if (!whyRequest) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void ask("why", whyRequest.objectiveId);
  }, [whyRequest, ask]);

  useEffect(() => {
    // Move focus to the new answer so keyboard and screen-reader users land on it.
    if (guide && !busy) resultRef.current?.focus();
  }, [guide, busy]);

  return (
    <Card aria-live="polite" ref={panelRef} className="scroll-mt-24">
      <h2 className="text-xl font-bold">Explain my progress</h2>
      <div className="flex flex-wrap gap-2 mt-3">
        {readyLecture && (
          <Button variant="secondary" className="py-1.5 text-sm" disabled={Boolean(busy)} onClick={() => ask("ready")}>
            Am I ready for {roadmap.plan.unitLabel} {readyLecture.number}?
          </Button>
        )}
        <Button variant="secondary" className="py-1.5 text-sm" disabled={Boolean(busy)} onClick={() => ask("next")}>
          What should I practise next?
        </Button>
        {whyObjective && (
          <Button variant="secondary" className="py-1.5 text-sm" disabled={Boolean(busy)} onClick={() => ask("why", whyObjective)}>
            Why does this objective need practice?
          </Button>
        )}
      </div>
      {busy && <Spinner label="Thinking about your progress" />}
      {err && <Alert tone="rose" role="alert">{err} Your progress above is still up to date.</Alert>}
      {guide && !busy && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {guide.source === "ai" ? <Badge tone="violet">AI explanation</Badge> : <Badge tone="navy">Rule-based summary</Badge>}
            {guide.errorCode && <Badge tone="amber">AI unavailable — showing your computed progress</Badge>}
          </div>
          <p ref={resultRef} tabIndex={-1} className="text-base">
            {guide.summary}
          </p>
          {guide.strengths.length > 0 && (
            <div>
              <p className="font-semibold">What you&apos;ve shown</p>
              <ul className="list-disc pl-5 space-y-1">
                {guide.strengths.map((s, i) => (
                  <li key={i}>
                    <span className="text-navy-soft">{objText(s.objectiveId)}:</span> {s.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {guide.practiceNeeds.length > 0 && (
            <div>
              <p className="font-semibold">What still needs practice</p>
              <ul className="list-disc pl-5 space-y-1">
                {guide.practiceNeeds.map((s, i) => (
                  <li key={i}>
                    <span className="text-navy-soft">{objText(s.objectiveId)}:</span> {s.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {guide.recommendedNextStep && (
            <div className="rounded-xl bg-violet-soft p-3 space-y-2">
              <p>
                <strong>Next:</strong> {guide.recommendedNextStep.explanation}
              </p>
              <Link className="font-semibold underline" href={`/roadmap/${planId}/practice/${guide.recommendedNextStep.objectiveId}`}>
                Rematch “{objText(guide.recommendedNextStep.objectiveId)}” →
              </Link>
            </div>
          )}
          {guide.limitations.length > 0 && (
            <ul className="text-xs text-navy-soft list-disc pl-5">
              {guide.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
