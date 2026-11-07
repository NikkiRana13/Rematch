"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, post } from "@/components/fetcher";
import { ClarifyView, FeedbackCard, PracticeView, QuestionForm, type Feedback, type Step, type StudentQuestion, type Practice } from "@/components/sprint";
import { Alert, Button, Card, LinkButton, Spinner, SubjectBadge } from "@/components/ui";

interface PlayState {
  competition: { id: string; title: string; subject: "reading" | "math"; questionCount: number };
  participant: { nickname: string };
  score: { initialPoints: number; comebackPoints: number };
  progress: { answered: number; total: number };
  step: Step;
  question?: StudentQuestion;
  practice?: Practice | null;
  feedback?: Feedback;
  yourReasoning?: string;
}

export default function PlayPage({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = use(params);
  const [state, setState] = useState<PlayState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setState(await api<PlayState>(`/api/play/${cid}`));
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (e) {
      setError(e as ApiError);
    }
  }, [cid]);

  // Show feedback immediately, and refresh score/progress from the server in the background
  // so the header reflects the answer that was just saved.
  const showFeedback = useCallback(
    (f: Feedback) => {
      setFeedback(f);
      api<PlayState>(`/api/play/${cid}`)
        .then(setState)
        .catch(() => {});
    },
    [cid],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (error) {
    if (error.status === 401)
      return (
        <Card className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold">Join first</h1>
          <p className="text-navy-soft mt-2">This sprint needs your room code and a nickname.</p>
          <LinkButton href="/join" className="mt-4">
            Join with a code
          </LinkButton>
        </Card>
      );
    return (
      <Alert tone="rose" role="alert" title="We couldn't load this sprint">
        <p>{error.message}</p>
        <Button variant="secondary" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </Alert>
    );
  }
  if (!state) return <Spinner label="Loading your sprint" />;

  const continueFlow = () => {
    setFeedback(null);
    setState(null);
    void load();
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <SubjectBadge subject={state.competition.subject} />
          <p className="font-semibold">{state.competition.title}</p>
        </div>
        <div className="text-right text-sm">
          <p>
            <strong>{state.score.initialPoints}</strong> first-try pts · <strong className="text-green">{state.score.comebackPoints}</strong> comeback pts
          </p>
          <p className="text-navy-soft" id="progress-label">
            {state.progress.answered} of {state.progress.total} questions answered
          </p>
          <div
            role="progressbar"
            aria-labelledby="progress-label"
            aria-valuemin={0}
            aria-valuemax={state.progress.total}
            aria-valuenow={state.progress.answered}
            className="ml-auto mt-1 h-2.5 w-40 overflow-hidden rounded-full bg-cream-2"
          >
            <div
              className="h-full rounded-full bg-violet transition-all"
              style={{ width: `${state.progress.total ? (100 * state.progress.answered) / state.progress.total : 0}%` }}
            />
          </div>
        </div>
      </div>

      {feedback ? (
        <FeedbackCard feedback={feedback} onContinue={continueFlow} />
      ) : (
        <StepView state={state} cid={cid} onFeedback={showFeedback} onAdvance={continueFlow} headingRef={headingRef} />
      )}
    </div>
  );
}

function StepView({
  state,
  cid,
  onFeedback,
  onAdvance,
  headingRef,
}: {
  state: PlayState;
  cid: string;
  onFeedback: (f: Feedback) => void;
  onAdvance: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const step = state.step;
  if (step.type === "question" && state.question)
    return (
      <QuestionForm
        key={step.questionId}
        heading={`Question ${step.index + 1} of ${step.total}`}
        question={state.question}
        headingRef={headingRef}
        onSubmit={(body) => post<{ feedback: Feedback }>(`/api/play/${cid}/answer`, body).then((r) => onFeedback(r.feedback))}
      />
    );
  if (step.type === "comeback" && state.question)
    return (
      <QuestionForm
        key={`cb-${step.attemptId}`}
        heading="Comeback question"
        intro="A fresh question on the same idea. Show what you practised!"
        question={state.question}
        headingRef={headingRef}
        onSubmit={(body) => post<{ feedback: Feedback }>(`/api/play/${cid}/attempts/${step.attemptId}/comeback`, body).then((r) => onFeedback(r.feedback))}
      />
    );
  if (step.type === "practice")
    return <PracticeView cid={cid} step={step} practice={state.practice ?? null} feedback={state.feedback} onDone={onAdvance} headingRef={headingRef} />;
  if (step.type === "clarify" && state.question)
    return <ClarifyView cid={cid} step={step} question={state.question} reasoning={state.yourReasoning ?? ""} onFeedback={onFeedback} headingRef={headingRef} />;
  if (step.type === "closed")
    return (
      <Card className="text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold">
          This sprint is closed
        </h1>
        <p className="text-navy-soft mt-2">Your host has closed this sprint. You can still see what you finished.</p>
        <LinkButton href={`/play/${cid}/results`} className="mt-4">
          See my results
        </LinkButton>
      </Card>
    );
  return (
    <Card className="text-center animate-pop">
      <p className="text-5xl" aria-hidden="true">
        🎉
      </p>
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold mt-2">
        Sprint complete!
      </h1>
      <p className="text-navy-soft mt-2">You finished every question. Let&apos;s look at how you grew.</p>
      <div className="flex justify-center gap-3 mt-5 flex-wrap">
        <LinkButton href={`/play/${cid}/results`}>See my results</LinkButton>
        <LinkButton href="/me" variant="secondary">
          My sprints
        </LinkButton>
      </div>
    </Card>
  );
}

