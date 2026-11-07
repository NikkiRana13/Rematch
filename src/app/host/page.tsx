"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HostGate } from "@/components/HostGate";
import { api, post } from "@/components/fetcher";
import { Alert, Badge, Button, Card, EmptyState, LinkButton, Spinner, StatusBadge, SubjectBadge } from "@/components/ui";
import type { SessionInfo } from "@/components/session";

interface Comp {
  id: string;
  title: string;
  subject: "reading" | "math";
  status: "draft" | "open" | "closed";
  roomCode: string;
  questionIds: string[];
  isDemoData: boolean;
  participantCount: number;
  createdAt: string;
}

export default function HostPage() {
  return <HostGate>{(host, session) => <Dashboard host={host} session={session} />}</HostGate>;
}

function Dashboard({ host, session }: { host: NonNullable<SessionInfo["host"]>; session: SessionInfo }) {
  const router = useRouter();
  const [comps, setComps] = useState<Comp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<"all" | "reading" | "math">("all");

  const load = useCallback(async () => {
    try {
      setComps((await api<{ competitions: Comp[] }>("/api/host/competitions")).competitions);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, msg?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (msg) setNotice(msg);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Host dashboard</h1>
          <p className="text-navy-soft">
            Signed in as {host.displayName} · teacher
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LinkButton href="/host/competitions/new">+ New competition</LinkButton>
          <LinkButton href="/host/plans" variant="secondary">
            Learning plans
          </LinkButton>
          <LinkButton href="/host/overview" variant="secondary">
            Class overview
          </LinkButton>
          <Button variant="secondary" onClick={() => act("logout", () => post("/api/auth/logout")).then(() => location.reload())}>
            Sign out
          </Button>
        </div>
      </div>

      {error && <Alert tone="rose" role="alert" title="Something went wrong">{error}</Alert>}
      {notice && <Alert tone="green" role="status">{notice}</Alert>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">Your competitions</h2>
          <div role="group" aria-label="Filter by subject" className="flex gap-1">
            {(["all", "reading", "math"] as const).map((s) => (
              <button
                key={s}
                aria-pressed={subjectFilter === s}
                onClick={() => setSubjectFilter(s)}
                className={`rounded-full px-3 py-1 text-sm border ${subjectFilter === s ? "bg-violet text-white border-violet" : "bg-white border-line"}`}
              >
                {s === "all" ? "All subjects" : s === "reading" ? "Reading" : "Math"}
              </button>
            ))}
          </div>
        </div>
        {!comps ? (
          <Spinner label="Loading competitions" />
        ) : comps.length === 0 ? (
          <EmptyState title="No competitions yet">
            <p>Create a reading or math sprint from the verified question bank.</p>
            <div className="flex justify-center gap-2 mt-4 flex-wrap">
              <LinkButton href="/host/competitions/new">Create a competition</LinkButton>
              <Button variant="secondary" disabled={busy === "demo"} onClick={() => act("demo", () => post("/api/host/demo-data"), "Demonstration data loaded.")}>
                Load labelled demo data
              </Button>
            </div>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {comps.filter((c) => subjectFilter === "all" || c.subject === subjectFilter).map((c) => (
              <li key={c.id} className="py-4 flex flex-wrap items-center gap-4 justify-between">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <SubjectBadge subject={c.subject} />
                    <StatusBadge status={c.status} />
                    {c.isDemoData && <Badge tone="amber">Demonstration data</Badge>}
                  </div>
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-sm text-navy-soft">
                    {c.questionIds.length} question{c.questionIds.length === 1 ? "" : "s"} · {c.participantCount} participant
                    {c.participantCount === 1 ? "" : "s"}
                    {c.status !== "draft" && (
                      <>
                        {" "}
                        · Room code <strong className="tracking-widest text-navy">{c.roomCode}</strong>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {c.status === "draft" && (
                    <>
                      <LinkButton variant="secondary" href={`/host/competitions/${c.id}/edit`}>
                        Edit
                      </LinkButton>
                      <Button
                        disabled={busy === c.id}
                        onClick={() => act(c.id, () => post(`/api/host/competitions/${c.id}/status`, { status: "open" }), `“${c.title}” is open. Share the room code.`)}
                      >
                        Launch
                      </Button>
                    </>
                  )}
                  {c.status === "open" && (
                    <Button variant="danger" disabled={busy === c.id} onClick={() => act(c.id, () => post(`/api/host/competitions/${c.id}/status`, { status: "closed" }))}>
                      Close
                    </Button>
                  )}
                  {c.status === "closed" && !c.isDemoData && (
                    <Button variant="secondary" disabled={busy === c.id} onClick={() => act(c.id, () => post(`/api/host/competitions/${c.id}/status`, { status: "open" }))}>
                      Reopen
                    </Button>
                  )}
                  {c.status !== "draft" && (
                    <LinkButton variant="ghost" href={`/host/competitions/${c.id}`}>
                      Results →
                    </LinkButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {comps && comps.length > 0 && !comps.some((c) => c.isDemoData) && (
          <Button variant="ghost" className="mt-3" disabled={busy === "demo"} onClick={() => act("demo", () => post("/api/host/demo-data"), "Demonstration data loaded.")}>
            Load labelled demo data
          </Button>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Recommendation subject="reading" onCreate={(id) => router.push(`/host/competitions/${id}/edit`)} />
        <Recommendation subject="math" onCreate={(id) => router.push(`/host/competitions/${id}/edit`)} />
      </div>

      {session.mode === "local-demo" && (
        <p className="text-sm text-navy-soft">
          Local demo tip: open{" "}
          <Link className="underline" href="/join?code=TEST55">
            /join?code=TEST55
          </Link>{" "}
          in a private window to play the hardcoded <strong>Local Test Sprint</strong> as a student while watching its{" "}
          <Link className="underline" href="/host/competitions/00000000-0000-4000-8000-000000007e57">
            results
          </Link>{" "}
          here.{" "}
          <button className="underline" onClick={() => act("reset", () => post("/api/dev/reset"), "Demo data reset.").then(() => location.reload())}>
            Reset demo data
          </button>
        </p>
      )}
    </div>
  );
}

function Recommendation({ subject, onCreate }: { subject: "reading" | "math"; onCreate: (id: string) => void }) {
  const [rec, setRec] = useState<{ questionIds: string[]; focusSkills: string[]; reviewSkills: string[]; rationale: string[]; basedOnAttempts: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<typeof rec>(`/api/host/recommendation?subject=${subject}`).then(setRec).catch((e) => setError((e as Error).message));
  }, [subject]);
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <SubjectBadge subject={subject} />
        <h2 className="font-bold">Suggested next sprint</h2>
      </div>
      {error && <Alert tone="rose">{error}</Alert>}
      {!rec && !error && <Spinner label="Working out a suggestion" />}
      {rec && (
        <>
          <p className="text-xs text-navy-soft mb-2">Built from explicit rules over {rec.basedOnAttempts} recent first attempts — not a trained model.</p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            {rec.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={busy || !rec.questionIds.length}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await post<{ competition: { id: string } }>("/api/host/competitions", {
                  title: `${subject === "reading" ? "Reading" : "Math"} Rematch — suggested`,
                  description: "Draft created from the rule-based suggestion. Review before launching.",
                  subject,
                  gradeLevel: 5,
                  questionIds: rec.questionIds,
                });
                onCreate(r.competition.id);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Create draft with {rec.questionIds.length} questions
          </Button>
        </>
      )}
    </Card>
  );
}
