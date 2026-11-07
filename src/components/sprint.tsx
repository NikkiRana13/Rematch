"use client";

import { useEffect, useRef, useState } from "react";
import { post } from "./fetcher";
import { ReadAloudButton } from "./a11y";
import { MathText } from "./MathText";
import { FractionBars } from "./FractionBars";
import { Alert, Badge, Button, Card, inputCls } from "./ui";

export interface StudentQuestion {
  id: string;
  subject: "reading" | "math";
  skillFocus: string;
  prompt: string;
  reasoningPrompt: string;
  answerChoices: { id: string; text: string }[];
  passage: { title: string; body: string } | null;
}
export interface Practice {
  id: string;
  kind: "targeted" | "general" | "slip";
  title: string;
  explanation: string[];
  workedExample: { passage?: string; problem?: string; steps: string[]; fractionBars?: { label: string; numerator: number; denominator: number }[] };
}
export interface Feedback {
  isCorrect: boolean;
  points: number;
  kind: "initial" | "comeback";
  message: string;
  idea: string | null;
  analysisSource: "ai" | "rule-based" | "unavailable" | "other" | null;
  correctAnswerText: string | null;
  explanation: string | null;
  adaptiveSupport: boolean;
  nextPath: string;
}
export type Step =
  | { type: "question"; questionId: string; index: number; total: number }
  | { type: "clarify"; attemptId: string; questionId: string; clarificationQuestion: string | null }
  | { type: "practice"; attemptId: string; practiceResourceId: string; optional: boolean; path: string }
  | { type: "comeback"; attemptId: string; questionId: string }
  | { type: "done" }
  | { type: "closed" };
export function Passage({ passage, onReadAloud }: { passage: { title: string; body: string }; onReadAloud: () => void }) {
  return (
    <div className="rounded-2xl bg-cream-2/70 p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{passage.title}</h2>
        <ReadAloudButton text={`${passage.title}. ${passage.body}`} label="Read passage aloud" onUsed={onReadAloud} />
      </div>
      <p className="reading-text text-lg">{passage.body}</p>
    </div>
  );
}

export function QuestionForm({
  heading,
  intro,
  question,
  onSubmit,
  headingRef,
}: {
  heading: string;
  intro?: string;
  question: StudentQuestion;
  onSubmit: (body: unknown) => Promise<void>;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState("");
  const [notSure, setNotSure] = useState(false);
  const [readAloudUsed, setReadAloudUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!choice) {
      setError("Pick an answer first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        questionId: question.id,
        selectedAnswer: choice,
        reasoning: notSure ? "" : reasoning,
        reasoningStatus: notSure ? "not_sure" : reasoning.trim() ? "provided" : "skipped",
        readAloudUsed,
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="animate-pop">
      <form onSubmit={submit} className="space-y-5" aria-describedby={intro ? "q-intro" : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <h1 ref={headingRef} tabIndex={-1} className="text-sm font-semibold uppercase tracking-wide text-violet-strong">
            {heading}
          </h1>
          <Badge tone="navy">{question.skillFocus}</Badge>
        </div>
        {intro && (
          <p id="q-intro" className="text-green font-medium">
            {intro}
          </p>
        )}
        {question.passage && <Passage passage={question.passage} onReadAloud={() => setReadAloudUsed(true)} />}
        <fieldset className="space-y-3">
          <legend className="text-xl sm:text-2xl font-bold reading-text mb-3">
            <MathText text={question.prompt} />
          </legend>
          {question.subject === "math" && (
            <ReadAloudButton text={question.prompt} label="Read question aloud" onUsed={() => setReadAloudUsed(true)} />
          )}
          <div className="grid gap-2">
            {question.answerChoices.map((c) => (
              <label
                key={c.id}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-violet ${
                  choice === c.id ? "border-violet bg-violet-soft" : "border-line bg-white hover:border-violet/50"
                }`}
              >
                <input type="radio" name="answer" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="sr-only" />
                <span
                  aria-hidden="true"
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-bold ${choice === c.id ? "bg-white border-2 border-violet text-navy" : "bg-cream-2"}`}
                >
                  {c.id}
                </span>
                <span className="reading-text">
                  <MathText text={c.text} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="reasoning" className="block font-semibold">
            {question.reasoningPrompt}
          </label>
          <textarea
            id="reasoning"
            className={`${inputCls} min-h-28 reading-text`}
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            disabled={notSure}
            maxLength={2000}
            aria-describedby="reasoning-hint"
          />
          <p id="reasoning-hint" className="text-xs text-navy-soft">
            Spelling doesn&apos;t matter — just tell us your thinking. Your explanation is saved before you see feedback.
          </p>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notSure} onChange={(e) => setNotSure(e.target.checked)} className="h-4 w-4 accent-violet" />
            I&apos;m not sure how to explain it
          </label>
        </div>

        {error && (
          <Alert tone="rose" role="alert" title="Not sent yet">
            {error}
          </Alert>
        )}
        <Button type="submit" className="w-full sm:w-auto text-lg px-8" disabled={busy}>
          {busy ? "Checking your answer…" : "Submit answer"}
        </Button>
        <p className="text-xs text-navy-soft">No timer — take as long as you need.</p>
      </form>
    </Card>
  );
}

export function FeedbackCard({ feedback, onContinue }: { feedback: Feedback; onContinue: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const good = feedback.isCorrect;
  return (
    <Card className={`animate-pop ${good ? "border-green/40 bg-green-soft/40" : ""}`} aria-live="polite">
      <div className="flex items-start gap-4">
        <span className="text-4xl" aria-hidden="true">
          {good ? (feedback.kind === "comeback" ? "🚀" : "⭐") : "🌱"}
        </span>
        <div className="space-y-3 flex-1">
          <h1 ref={ref} tabIndex={-1} className="text-2xl font-bold">
            {good ? (feedback.kind === "comeback" ? "Comeback complete!" : "Correct!") : feedback.nextPath === "clarify" ? "Tell us a bit more" : "Keep going"}
          </h1>
          {feedback.points > 0 && (
            <Badge tone={feedback.kind === "comeback" ? "green" : "violet"} className="text-sm">
              +{feedback.points} {feedback.kind === "comeback" ? "comeback points" : "points"}
            </Badge>
          )}
          <p>{feedback.message}</p>
          {feedback.idea && <Alert tone="violet">{feedback.idea}</Alert>}
          {feedback.correctAnswerText && !good && (
            <p>
              The best answer was: <strong><MathText text={feedback.correctAnswerText} /></strong>
            </p>
          )}
          {feedback.explanation && (
            <details className="rounded-xl bg-white/70 p-3">
              <summary className="cursor-pointer font-semibold">Why?</summary>
              <p className="mt-2 reading-text">
                <MathText text={feedback.explanation} />
              </p>
            </details>
          )}
          {feedback.analysisSource === "unavailable" && (
            <p className="text-xs text-navy-soft">We couldn&apos;t check your explanation this time, so here&apos;s general practice. Your score isn&apos;t affected.</p>
          )}
          <Button onClick={onContinue} className="mt-2">
            Continue
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function PracticeView({
  cid,
  step,
  practice,
  feedback,
  onDone,
  headingRef,
}: {
  cid: string;
  step: Extract<Step, { type: "practice" }>;
  practice: Practice | null;
  feedback?: Feedback;
  onDone: () => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finish = async () => {
    setBusy(true);
    try {
      await post(`/api/play/${cid}/attempts/${step.attemptId}/practice`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  if (!practice) return <Alert tone="amber" title="Practice not found">Let&apos;s keep going.</Alert>;
  const ex = practice.workedExample;
  return (
    <Card className="animate-pop space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-green">
          {step.optional ? "Optional practice" : practice.kind === "slip" ? "Quick check" : "Practice time"}
        </p>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl sm:text-3xl font-bold">
          {practice.title}
        </h1>
        {feedback?.idea && <Alert tone="violet">{feedback.idea}</Alert>}
        {step.optional && <p className="text-navy-soft">Your answer was correct and your points are safe. This card can help sharpen your explanation.</p>}
      </div>
      <ul className="space-y-2 reading-text text-lg list-disc pl-6">
        {practice.explanation.map((t) => (
          <li key={t}>
            <MathText text={t} />
          </li>
        ))}
      </ul>
      <section aria-labelledby="worked" className="rounded-2xl border border-line bg-cream-2/50 p-4 sm:p-5 space-y-4">
        <h2 id="worked" className="font-bold">
          Worked example
        </h2>
        {ex.passage && (
          <div className="space-y-2">
            <ReadAloudButton text={ex.passage} label="Read example aloud" />
            <blockquote className="border-l-4 border-violet pl-4 reading-text text-lg italic">{ex.passage}</blockquote>
          </div>
        )}
        {ex.problem && (
          <p className="font-semibold reading-text">
            <MathText text={ex.problem} />
          </p>
        )}
        {ex.fractionBars && <FractionBars bars={ex.fractionBars} />}
        <ol className="space-y-2 list-decimal pl-6 reading-text">
          {ex.steps.map((s) => (
            <li key={s}>
              <MathText text={s} />
            </li>
          ))}
        </ol>
      </section>
      {error && <Alert tone="rose" role="alert">{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button variant="success" onClick={finish} disabled={busy}>
          {step.optional ? "Got it — continue" : feedback?.nextPath && feedback.nextPath !== "continue" ? "I'm ready for my comeback" : "Continue"}
        </Button>
        {step.optional && (
          <Button variant="secondary" onClick={finish} disabled={busy}>
            Skip for now
          </Button>
        )}
      </div>
    </Card>
  );
}

export function ClarifyView({
  cid,
  step,
  question,
  reasoning,
  onFeedback,
  headingRef,
}: {
  cid: string;
  step: Extract<Step, { type: "clarify" }>;
  question: StudentQuestion;
  reasoning: string;
  onFeedback: (f: Feedback) => void;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ feedback: Feedback }>(`/api/play/${cid}/attempts/${step.attemptId}/clarify`, body);
      onFeedback(r.feedback);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Card className="animate-pop space-y-4">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold">
        Help us understand your thinking
      </h1>
      {question.passage && (
        <details className="rounded-xl bg-cream-2/70 p-3">
          <summary className="cursor-pointer font-semibold">Show the passage again</summary>
          <p className="reading-text mt-2">{question.passage.body}</p>
        </details>
      )}
      <p className="reading-text">
        <strong>Question:</strong> <MathText text={question.prompt} />
      </p>
      {reasoning && (
        <p className="text-navy-soft">
          You wrote: <q>{reasoning}</q>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send({ text });
        }}
        className="space-y-3"
      >
        <label htmlFor="clarify" className="block font-semibold">
          {step.clarificationQuestion ?? "Can you tell us more about how you decided?"}
        </label>
        <textarea id="clarify" className={`${inputCls} min-h-24 reading-text`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
        {error && <Alert tone="rose" role="alert">{error}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? "Sending…" : "Send"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void send({ declined: true })}>
            I&apos;d rather move on
          </Button>
        </div>
      </form>
    </Card>
  );
}
