"use client";

import { use, useCallback, useEffect, useState } from "react";
import { api, post } from "@/components/fetcher";
import { ClarifyView, FeedbackCard, PracticeView, QuestionForm, type Feedback, type Practice, type Step, type StudentQuestion } from "@/components/sprint";
import { StatusPill, type ObjectiveStatus } from "@/components/roadmap";
import { Alert, Card, LinkButton, Spinner } from "@/components/ui";

interface Start {
  objective: { id: string; text: string; lecture: string };
  planTitle: string;
  question: StudentQuestion | null;
  repeat: boolean;
  message: string | null;
}
interface AttemptState {
  step: Step;
  practiceCompetitionId: string;
  practice?: Practice | null;
  question?: StudentQuestion;
  yourReasoning?: string;
}

export default function ObjectivePracticePage({ params }: { params: Promise<{ planId: string; objectiveId: string }> }) {
  const { planId, objectiveId } = use(params);
  const [start, setStart] = useState<Start | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [state, setState] = useState<AttemptState | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [status, setStatus] = useState<ObjectiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Start>(`/api/roadmap/${planId}/objectives/${objectiveId}/practice`).then(setStart).catch((e) => setError((e as Error).message));
  }, [planId, objectiveId]);

  const loadState = useCallback(
    async (aid: string) => {
      const s = await api<AttemptState>(`/api/roadmap/${planId}/attempts/${aid}`);
      setState(s);
      if (s.step.type === "done") {
        const r = await api<{ lectures: { objectives: { id: string; progress: { status: ObjectiveStatus } }[] }[] }>(`/api/roadmap/${planId}`);
        setStatus(r.lectures.flatMap((l) => l.objectives).find((o) => o.id === objectiveId)?.progress.status ?? null);
      }
    },
    [planId, objectiveId],
  );

  const advance = () => {
    setFeedback(null);
    if (attemptId) void loadState(attemptId).catch((e) => setError((e as Error).message));
  };

  if (error) return <Alert tone="rose" role="alert" title="Something went wrong">{error}</Alert>;
  if (!start) return <Spinner label="Finding a question for this objective" />;

  const header = (
    <div className="space-y-1">
      <LinkButton href={`/roadmap?plan=${planId}`} variant="ghost" className="px-0 py-1">
        ← Back to my roadmap
      </LinkButton>
      <p className="text-sm text-navy-soft">{start.objective.lecture}</p>
      <h1 className="text-2xl font-bold reading-text">{start.objective.text}</h1>
    </div>
  );

  if (!start.question)
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        {header}
        <Card>
          <p className="text-lg">{start.message}</p>
        </Card>
      </div>
    );

  let body: React.ReactNode;
  if (feedback) body = <FeedbackCard feedback={feedback} onContinue={advance} />;
  else if (!attemptId)
    body = (
      <>
        {start.repeat && (
          <Alert tone="amber" title="You've seen this question before">
            It&apos;s the only practice available right now, so it will count as practice — not new evidence for this objective.
          </Alert>
        )}
        <QuestionForm
          heading="Rematch question"
          intro="Answer on your own — this question can count as evidence for this objective."
          question={start.question}
          onSubmit={async (b) => {
            const r = await post<{ attemptId: string; feedback: Feedback }>(`/api/roadmap/${planId}/objectives/${objectiveId}/answer`, b);
            setAttemptId(r.attemptId);
            setFeedback(r.feedback);
          }}
        />
      </>
    );
  else if (!state) body = <Spinner label="Loading" />;
  else if (state.step.type === "practice")
    body = <PracticeView cid={state.practiceCompetitionId} step={state.step} practice={state.practice ?? null} onDone={advance} />;
  else if (state.step.type === "clarify" && state.question)
    body = <ClarifyView cid={state.practiceCompetitionId} step={state.step} question={state.question} reasoning={state.yourReasoning ?? ""} onFeedback={setFeedback} />;
  else if (state.step.type === "comeback" && state.question) {
    const step = state.step;
    body = (
      <QuestionForm
        key={`cb-${step.attemptId}`}
        heading="Comeback question"
        intro="A fresh question on the same idea. Show what you practised!"
        question={state.question}
        onSubmit={async (b) => setFeedback((await post<{ feedback: Feedback }>(`/api/play/${state.practiceCompetitionId}/attempts/${step.attemptId}/comeback`, b)).feedback)}
      />
    );
  } else
    body = (
      <Card className="text-center space-y-3 animate-pop">
        <p className="text-4xl" aria-hidden="true">
          🌟
        </p>
        <h2 className="text-2xl font-bold">Rematch saved</h2>
        <p className="text-navy-soft">Your roadmap has been updated with this answer.</p>
        {status && (
          <p>
            This objective is now: <StatusPill status={status} />
          </p>
        )}
        <div className="flex justify-center gap-3 flex-wrap">
          <LinkButton href={`/roadmap?plan=${planId}`}>Back to my roadmap</LinkButton>
          <LinkButton href={`/roadmap/${planId}/practice/${objectiveId}`} variant="secondary" onClick={() => location.reload()}>
            Try another question
          </LinkButton>
        </div>
      </Card>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {header}
      {body}
    </div>
  );
}
