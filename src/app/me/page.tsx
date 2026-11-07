"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/fetcher";
import { Alert, Card, EmptyState, LinkButton, Spinner, StatusBadge, SubjectBadge } from "@/components/ui";
import { ScorePills, SubjectProgress, type SkillProgress } from "@/components/student";

interface Home {
  nickname: string;
  sprints: {
    id: string;
    title: string;
    subject: "reading" | "math";
    status: "draft" | "open" | "closed";
    questionCount: number;
    answered: number;
    initialPoints: number;
    comebackPoints: number;
  }[];
  progress: SkillProgress[];
}

export default function StudentHome() {
  const [home, setHome] = useState<Home | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ home: Home | null }>("/api/me")
      .then((r) => setHome(r.home))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert tone="rose" role="alert" title="Couldn't load your sprints">{error}</Alert>;
  if (home === undefined) return <Spinner label="Loading your sprints" />;
  if (home === null)
    return (
      <EmptyState title="You haven't joined a sprint on this device yet">
        <p>Ask your host for a room code to get started.</p>
        <LinkButton href="/join" className="mt-4">
          Join with a code
        </LinkButton>
      </EmptyState>
    );

  const totals = home.sprints.reduce((s, x) => ({ i: s.i + x.initialPoints, c: s.c + x.comebackPoints }), { i: 0, c: 0 });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Hi, {home.nickname}! 👋</h1>
          <p className="text-navy-soft">Your progress is private — only you and your hosts can see it.</p>
        </div>
        <ScorePills initialPoints={totals.i} comebackPoints={totals.c} />
      </div>

      <Card>
        <h2 className="text-xl font-bold mb-4">Your sprints</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {home.sprints.map((s) => (
            <li key={s.id} className="rounded-2xl border border-line p-4 space-y-2">
              <div className="flex gap-2 flex-wrap">
                <SubjectBadge subject={s.subject} />
                <StatusBadge status={s.status} />
              </div>
              <p className="font-semibold">{s.title}</p>
              <p className="text-sm text-navy-soft">
                {s.answered} of {s.questionCount} questions answered
              </p>
              <div className="flex gap-2">
                {s.status === "open" && s.answered < s.questionCount && <LinkButton href={`/play/${s.id}`}>Continue</LinkButton>}
                <LinkButton href={`/play/${s.id}/results`} variant="secondary">
                  Results
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
        <LinkButton href="/join" variant="ghost" className="mt-4">
          + Join another sprint
        </LinkButton>
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Your progress</h2>
        <p className="text-sm text-navy-soft mb-4">
          Based on your most recent first try at each question. Comebacks are shown separately. This is a simple count, not a mastery score.
        </p>
        <div className="grid gap-8 md:grid-cols-2">
          <SubjectProgress title="Reading" icon="📖" skills={home.progress.filter((p) => p.subject === "reading")} />
          <SubjectProgress title="Math" icon="➗" skills={home.progress.filter((p) => p.subject === "math")} />
        </div>
      </Card>
    </div>
  );
}
