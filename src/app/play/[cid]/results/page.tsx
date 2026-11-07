"use client";

import { use, useEffect, useState } from "react";
import { api } from "@/components/fetcher";
import { MathText } from "@/components/MathText";
import { ScorePills, SubjectProgress, type SkillProgress } from "@/components/student";
import { Alert, Badge, Card, LinkButton, Spinner, SubjectBadge } from "@/components/ui";

interface Results {
  competition: { title: string; subject: "reading" | "math" };
  nickname: string;
  score: { initialPoints: number; comebackPoints: number; initialCorrect: number; initialTotal: number; comebackCorrect: number; comebackTotal: number };
  items: {
    prompt: string;
    skillLabel: string;
    isCorrect: boolean;
    points: number;
    correctAnswerText: string | null;
    explanation: string;
    comeback: { isCorrect: boolean; points: number } | null;
  }[];
  skills: SkillProgress[];
}

export default function ResultsPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = use(params);
  const [r, setR] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Results>(`/api/play/${cid}/results`).then(setR).catch((e) => setError((e as Error).message));
  }, [cid]);

  if (error) return <Alert tone="rose" role="alert" title="Couldn't load results">{error}</Alert>;
  if (!r) return <Spinner label="Loading your results" />;
  const { score } = r;
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="space-y-2">
        <SubjectBadge subject={r.competition.subject} />
        <h1 className="text-3xl font-bold">Your results: {r.competition.title}</h1>
        <p className="text-navy-soft">These results are private to you and your host.</p>
      </div>
      <ScorePills initialPoints={score.initialPoints} comebackPoints={score.comebackPoints} />
      {score.comebackCorrect > 0 && (
        <Alert tone="green" title="You made a comeback! 🚀">
          You got {score.comebackCorrect} of {score.comebackTotal} comeback questions right after practising. That&apos;s what practice is for.
        </Alert>
      )}
      <Card>
        <h2 className="text-xl font-bold mb-3">Question by question</h2>
        {r.items.length === 0 ? (
          <p className="text-navy-soft">You haven&apos;t answered any questions yet.</p>
        ) : (
          <ol className="space-y-4">
            {r.items.map((it, i) => (
              <li key={i} className="rounded-2xl border border-line p-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="navy">{it.skillLabel}</Badge>
                  {it.isCorrect ? <Badge tone="violet">First try ✓ +{it.points}</Badge> : <Badge tone="amber">First try: still learning</Badge>}
                  {it.comeback &&
                    (it.comeback.isCorrect ? <Badge tone="green">Comeback ✓ +{it.comeback.points}</Badge> : <Badge tone="navy">Comeback tried</Badge>)}
                </div>
                <p className="font-semibold reading-text">
                  <MathText text={it.prompt} />
                </p>
                {it.correctAnswerText && (
                  <p className="text-sm">
                    Answer: <MathText text={it.correctAnswerText} />
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-violet-strong">Explanation</summary>
                  <p className="text-sm reading-text mt-1">
                    <MathText text={it.explanation} />
                  </p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <Card>
        <h2 className="text-xl font-bold mb-3">Skills in this sprint</h2>
        <SubjectProgress title={r.competition.subject === "reading" ? "Reading" : "Math"} icon={r.competition.subject === "reading" ? "📖" : "➗"} skills={r.skills} />
      </Card>
      <div className="flex gap-3">
        <LinkButton href="/me">My sprints</LinkButton>
        <LinkButton href="/join" variant="secondary">
          Join another
        </LinkButton>
      </div>
    </div>
  );
}
