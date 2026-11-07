"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, post } from "./fetcher";
import { MathText } from "./MathText";
import { Alert, Badge, Button, Card, Field, Spinner, inputCls } from "./ui";

type Subject = "reading" | "math";
interface Q {
  id: string;
  subject: Subject;
  skill: string;
  skillFocus: string;
  questionRole: "initial" | "follow-up";
  passageId: string | null;
  prompt: string;
  answerChoices: { id: string; text: string }[];
  correctAnswer: string;
  followUpQuestionId: string | null;
  verified: boolean;
  source: "seed" | "manual";
}
interface Bank {
  questions: Q[];
  passages: { id: string; title: string; body: string }[];
  practice: { id: string; title: string; skill: string; kind: string; misconception: string | null; verified: boolean }[];
  skills: { id: string; subject: Subject; label: string; adaptive: boolean; adaptiveFocus: string | null }[];
}
interface Comp {
  id: string;
  title: string;
  description: string;
  subject: Subject;
  gradeLevel: number;
  status: "draft" | "open" | "closed";
  questionIds: string[];
}

const MISCONCEPTIONS: Record<Subject, { code: string; label: string }[]> = {
  reading: [
    { code: "UNSUPPORTED_INFERENCE", label: "Unsupported inference" },
    { code: "EXPLICIT_STATEMENT_REQUIRED", label: "Expects the answer to be stated directly" },
  ],
  math: [
    { code: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", label: "Larger denominator means larger amount" },
    { code: "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT", label: "Same numerator means equal amount" },
  ],
};

export function CompetitionEditor({ competitionId }: { competitionId?: string }) {
  const router = useRouter();
  const [comp, setComp] = useState<Comp | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState<Subject>("reading");
  const [gradeLevel, setGradeLevel] = useState(5);
  const [selected, setSelected] = useState<string[]>([]);
  const [bank, setBank] = useState<Bank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const locked = comp ? comp.status !== "draft" : false;

  useEffect(() => {
    if (!competitionId) return;
    api<{ competition: Comp }>(`/api/host/competitions/${competitionId}`)
      .then(({ competition: c }) => {
        setComp(c);
        setTitle(c.title);
        setDescription(c.description);
        setSubject(c.subject);
        setGradeLevel(c.gradeLevel);
        setSelected(c.questionIds);
      })
      .catch((e) => setError((e as Error).message));
  }, [competitionId]);

  const loadBank = useCallback(async () => {
    try {
      setBank(await api<Bank>(`/api/host/bank?subject=${subject}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subject]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBank();
  }, [loadBank]);

  const skills = useMemo(() => bank?.skills.filter((s) => s.subject === subject) ?? [], [bank, subject]);
  const initialQs = bank?.questions.filter((q) => q.questionRole === "initial" && q.subject === subject) ?? [];
  const isAdaptive = (q: Q) => {
    const s = skills.find((k) => k.id === q.skill);
    const followUp = bank?.questions.find((f) => f.id === q.followUpQuestionId);
    return Boolean(s?.adaptive && followUp?.verified && bank?.practice.some((p) => p.skill === q.skill && p.kind === "targeted" && p.verified));
  };

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const move = (i: number, d: -1 | 1) =>
    setSelected((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function save(launch: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = { title, description, subject, gradeLevel, questionIds: selected };
      const id = competitionId
        ? (await api<{ competition: Comp }>(`/api/host/competitions/${competitionId}`, { method: "PUT", body: JSON.stringify(body) })).competition.id
        : (await post<{ competition: Comp }>("/api/host/competitions", body)).competition.id;
      if (launch) await post(`/api/host/competitions/${id}/status`, { status: "open" });
      router.push(launch ? `/host/competitions/${id}` : "/host");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (competitionId && !comp && !error) return <Spinner label="Loading competition" />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{competitionId ? "Edit competition" : "New competition"}</h1>
      {locked && <Alert tone="amber" title="This competition has launched">Questions and subject are locked so results stay comparable.</Alert>}
      <Card className="space-y-4">
        <Field label="Title" htmlFor="title">
          <input id="title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
        </Field>
        <Field label="Description" htmlFor="desc" hint="Shown to participants.">
          <textarea id="desc" className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} />
        </Field>
        <div className="flex flex-wrap gap-6">
          <fieldset disabled={locked}>
            <legend className="font-semibold text-sm mb-1">Subject</legend>
            <div className="flex gap-4">
              {(["reading", "math"] as const).map((s) => (
                <label key={s} className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="subject"
                    className="accent-violet"
                    checked={subject === s}
                    onChange={() => {
                      setSubject(s);
                      setSelected([]);
                    }}
                  />
                  {s === "reading" ? "Reading comprehension" : "Math"}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Grade" htmlFor="grade" hint="Seeded content is Grade 5 demonstration level.">
            <input id="grade" type="number" min={1} max={12} className={`${inputCls} w-24`} value={gradeLevel} onChange={(e) => setGradeLevel(Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="text-xl font-bold">Sprint order ({selected.length})</h2>
        {selected.length === 0 ? (
          <p className="text-sm text-navy-soft mt-2">Pick questions from the bank below.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {selected.map((id, i) => {
              const q = bank?.questions.find((x) => x.id === id);
              return (
                <li key={id} className="flex items-center gap-2 rounded-xl border border-line p-2">
                  <span className="font-bold w-6 text-center">{i + 1}</span>
                  <span className="flex-1 text-sm">{q ? <MathText text={q.prompt} /> : id}</span>
                  {!locked && (
                    <>
                      <Button type="button" variant="ghost" className="px-2 py-1" aria-label={`Move question ${i + 1} up`} onClick={() => move(i, -1)}>
                        ↑
                      </Button>
                      <Button type="button" variant="ghost" className="px-2 py-1" aria-label={`Move question ${i + 1} down`} onClick={() => move(i, 1)}>
                        ↓
                      </Button>
                      <Button type="button" variant="ghost" className="px-2 py-1" aria-label={`Remove question ${i + 1}`} onClick={() => toggle(id)}>
                        ✕
                      </Button>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Question bank</h2>
          {!locked && (
            <Button variant="secondary" onClick={() => setShowNew((v) => !v)} aria-expanded={showNew}>
              {showNew ? "Close new question" : "+ Write a question"}
            </Button>
          )}
        </div>
        {showNew && bank && (
          <NewQuestion
            subject={subject}
            bank={bank}
            skills={skills}
            onCreated={async (q) => {
              await loadBank();
              if (q.questionRole === "initial" && q.verified) setSelected((s) => [...s, q.id]);
              setShowNew(false);
            }}
          />
        )}
        {!bank ? (
          <Spinner label="Loading question bank" />
        ) : (
          skills.map((s) => {
            const qs = initialQs.filter((q) => q.skill === s.id);
            return (
              <section key={s.id} className="mt-5" aria-labelledby={`skill-${s.id}`}>
                <h3 id={`skill-${s.id}`} className="font-bold flex flex-wrap items-center gap-2">
                  {s.label}
                  {s.adaptive ? <Badge tone="green">Adaptive: {s.adaptiveFocus}</Badge> : <Badge tone="navy">No adaptive support yet</Badge>}
                </h3>
                {qs.length === 0 ? (
                  <p className="text-sm text-navy-soft">No questions yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {qs.map((q) => (
                      <li key={q.id} className="rounded-xl border border-line p-3">
                        <label className="flex gap-3 items-start cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-1 h-5 w-5 accent-violet"
                            checked={selected.includes(q.id)}
                            disabled={locked || (!q.verified && !selected.includes(q.id))}
                            onChange={() => toggle(q.id)}
                          />
                          <span className="space-y-1 flex-1">
                            <span className="block font-medium">
                              <MathText text={q.prompt} />
                            </span>
                            <span className="flex flex-wrap gap-2">
                              {q.verified ? <Badge tone="green">Verified key: {q.correctAnswer}</Badge> : <Badge tone="rose">Unverified — can&apos;t launch</Badge>}
                              {isAdaptive(q) && <Badge tone="violet">Targeted practice + comeback</Badge>}
                              {q.source === "manual" && <Badge tone="amber">Your question</Badge>}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </Card>

      {error && <Alert tone="rose" role="alert" title="Couldn't save">{error}</Alert>}
      <div className="flex flex-wrap gap-3 sticky bottom-4">
        <Button variant="secondary" disabled={busy || !title.trim()} onClick={() => save(false)}>
          Save {locked ? "changes" : "draft"}
        </Button>
        {!locked && (
          <Button disabled={busy || !title.trim() || !selected.length} onClick={() => save(true)}>
            Save and launch
          </Button>
        )}
      </div>
    </div>
  );
}

function NewQuestion({
  subject,
  bank,
  skills,
  onCreated,
}: {
  subject: Subject;
  bank: Bank;
  skills: Bank["skills"];
  onCreated: (q: Q) => void;
}) {
  const [skill, setSkill] = useState(skills[0]?.id ?? "");
  const [role, setRole] = useState<"initial" | "follow-up">("initial");
  const [passageId, setPassageId] = useState<string>("");
  const [newPassage, setNewPassage] = useState({ title: "", body: "" });
  const [prompt, setPrompt] = useState("");
  const [reasoningPrompt, setReasoningPrompt] = useState(subject === "reading" ? "Which clues in the passage helped you decide?" : "Explain how you decided.");
  const [choices, setChoices] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState("A");
  const [explanation, setExplanation] = useState("");
  const [misconceptions, setMisconceptions] = useState<string[]>([]);
  const [practiceId, setPracticeId] = useState("");
  const [followUpId, setFollowUpId] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const letters = ["A", "B", "C", "D"];
  const practice = bank.practice.filter((p) => p.skill === skill);
  const followUps = bank.questions.filter((q) => q.skill === skill && q.questionRole === "follow-up");
  const skillMeta = skills.find((s) => s.id === skill);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let pid: string | null = subject === "reading" ? passageId || null : null;
      if (subject === "reading" && passageId === "__new") {
        pid = (await post<{ passage: { id: string } }>("/api/host/passages", { ...newPassage, gradeLevel: 5 })).passage.id;
      }
      const r = await post<{ question: Q }>("/api/host/questions", {
        subject,
        gradeLevel: 5,
        skill,
        questionRole: role,
        passageId: pid,
        prompt,
        reasoningPrompt,
        answerChoices: choices.map((t, i) => ({ id: letters[i], text: t })).filter((c) => c.text.trim()),
        correctAnswer: correct,
        referenceExplanation: explanation,
        allowedMisconceptions: misconceptions,
        practiceResourceId: practiceId || null,
        followUpQuestionId: role === "initial" ? followUpId || null : null,
        verified,
      });
      onCreated(r.question);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-2xl bg-cream-2/60 p-4">
      <h3 className="font-bold">Write a question</h3>
      <p className="text-sm text-navy-soft">Test one concept, include exactly one defensible answer, and use distractors that reflect different reasoning errors.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Skill" htmlFor="nq-skill" hint={skillMeta?.adaptive ? `Adaptive content exists for: ${skillMeta.adaptiveFocus}` : "No adaptive support for this skill yet."}>
          <select id="nq-skill" className={inputCls} value={skill} onChange={(e) => setSkill(e.target.value)}>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role" htmlFor="nq-role" hint="Follow-up questions are only used as comeback questions.">
          <select id="nq-role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value as "initial" | "follow-up")}>
            <option value="initial">Initial (in the sprint)</option>
            <option value="follow-up">Follow-up (comeback)</option>
          </select>
        </Field>
      </div>
      {subject === "reading" && (
        <Field label="Passage" htmlFor="nq-passage">
          <select id="nq-passage" className={inputCls} value={passageId} onChange={(e) => setPassageId(e.target.value)} required>
            <option value="">Choose a passage…</option>
            {bank.passages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            <option value="__new">+ New passage</option>
          </select>
        </Field>
      )}
      {passageId === "__new" && (
        <div className="grid gap-3">
          <Field label="Passage title" htmlFor="np-title">
            <input id="np-title" className={inputCls} value={newPassage.title} onChange={(e) => setNewPassage({ ...newPassage, title: e.target.value })} />
          </Field>
          <Field label="Passage text" htmlFor="np-body">
            <textarea id="np-body" className={`${inputCls} min-h-24`} value={newPassage.body} onChange={(e) => setNewPassage({ ...newPassage, body: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Question" htmlFor="nq-prompt" hint={subject === "math" ? "Write fractions like 3/4. State that wholes are the same size." : undefined}>
        <textarea id="nq-prompt" className={inputCls} value={prompt} onChange={(e) => setPrompt(e.target.value)} required />
      </Field>
      <fieldset className="space-y-2">
        <legend className="font-semibold text-sm">Answer choices (select the one correct answer)</legend>
        {choices.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="nq-correct"
              aria-label={`Choice ${letters[i]} is correct`}
              className="h-5 w-5 accent-green"
              checked={correct === letters[i]}
              onChange={() => setCorrect(letters[i])}
            />
            <label htmlFor={`nq-c${i}`} className="font-bold w-5">
              {letters[i]}
            </label>
            <input id={`nq-c${i}`} className={inputCls} value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} />
          </div>
        ))}
      </fieldset>
      <Field label="Reasoning prompt" htmlFor="nq-rp">
        <input id="nq-rp" className={inputCls} value={reasoningPrompt} onChange={(e) => setReasoningPrompt(e.target.value)} />
      </Field>
      <Field label="Reference explanation" htmlFor="nq-expl" hint="Used for feedback and as the analysis reference.">
        <textarea id="nq-expl" className={inputCls} value={explanation} onChange={(e) => setExplanation(e.target.value)} required />
      </Field>
      <fieldset>
        <legend className="font-semibold text-sm mb-1">Misconceptions this question can reveal</legend>
        {MISCONCEPTIONS[subject].map((m) => (
          <label key={m.code} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-violet"
              checked={misconceptions.includes(m.code)}
              onChange={() => setMisconceptions((s) => (s.includes(m.code) ? s.filter((x) => x !== m.code) : [...s, m.code]))}
            />
            {m.label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="General practice link" htmlFor="nq-pr">
          <select id="nq-pr" className={inputCls} value={practiceId} onChange={(e) => setPracticeId(e.target.value)}>
            <option value="">None</option>
            {practice.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.kind})
              </option>
            ))}
          </select>
        </Field>
        {role === "initial" && (
          <Field label="Comeback (follow-up) question" htmlFor="nq-fu" hint="Leave empty for a terminal question.">
            <select id="nq-fu" className={inputCls} value={followUpId} onChange={(e) => setFollowUpId(e.target.value)}>
              <option value="">None</option>
              {followUps.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.prompt.slice(0, 60)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <label className="flex items-start gap-2 rounded-xl bg-white p-3">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-green" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        <span className="text-sm">
          <strong>I verified the answer key.</strong> Exactly one choice is defensibly correct. Unverified questions are saved but can&apos;t be launched.
        </span>
      </label>
      {error && <Alert tone="rose" role="alert">{error}</Alert>}
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save question"}
      </Button>
    </form>
  );
}
