/**
 * FICTIONAL, SYNTHETIC demonstration history. Every participant, response, and analysis
 * produced here is flagged `isSynthetic` / `isDemoData` and labelled "Demonstration data"
 * in the UI. None of it represents real students or real results.
 */
import { randomUUID } from "node:crypto";
import { SEED_PRACTICE, SEED_QUESTIONS } from "../content/seed";
import { decideRoute } from "../routing";
import { COMEBACK_POINTS, FIRST_ATTEMPT_POINTS } from "../scoring";
import type { Analysis, Attempt, Category, Competition, Participant, Question } from "../types";
import { generateRoomCode } from "./roomCode";

export const SYNTHETIC_NAMES = [
  "Maple Fox",
  "River Owl",
  "Cedar Wren",
  "Sunny Hare",
  "Pebble Lynx",
  "Comet Otter",
  "Juniper Bee",
  "Quartz Heron",
];

interface Script {
  p: number;
  q: string;
  ans: string;
  reason: string;
  cat: Category;
  quote?: string;
  clar?: { text: string; cat: Category; quote?: string } | "declined";
  comebackCorrect?: boolean;
}

const READING_SCRIPT: Script[] = [
  { p: 0, q: "q-read-inf-amina", ans: "C", reason: "The soil was dry and the window was hot so she moved it so it wont dry out", cat: "NO_MISCONCEPTION_DETECTED" },
  { p: 1, q: "q-read-inf-amina", ans: "B", reason: "The teacher probably told her because teachers are in charge of the plants.", cat: "UNSUPPORTED_INFERENCE", quote: "teachers are in charge of the plants", comebackCorrect: true },
  { p: 2, q: "q-read-inf-amina", ans: "A", reason: "It doesn't say why she moved it so I picked hide.", cat: "EXPLICIT_STATEMENT_REQUIRED", quote: "It doesn't say why she moved it", comebackCorrect: true },
  { p: 3, q: "q-read-inf-amina", ans: "C", reason: "dry soil and drooping plants and the hot window", cat: "NO_MISCONCEPTION_DETECTED" },
  { p: 4, q: "q-read-inf-amina", ans: "D", reason: "idk", cat: "INSUFFICIENT_EVIDENCE", clar: { text: "the sun is bad for baby plants", cat: "UNSUPPORTED_INFERENCE", quote: "the sun is bad for baby plants" }, comebackCorrect: false },
  { p: 5, q: "q-read-inf-amina", ans: "B", reason: "Because the teacher said so", cat: "UNSUPPORTED_INFERENCE", quote: "Because the teacher said so", comebackCorrect: true },
  { p: 6, q: "q-read-inf-amina", ans: "C", reason: "", cat: "INSUFFICIENT_EVIDENCE" },
  { p: 7, q: "q-read-inf-amina", ans: "C", reason: "The plants were thirsty and the window was hot.", cat: "NO_MISCONCEPTION_DETECTED" },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Script => ({
    p,
    q: "q-read-main-amina",
    ans: p === 4 || p === 5 ? "C" : "B",
    reason: p === 4 || p === 5 ? "the window was hot" : "It is all about Amina helping the seedlings.",
    cat: p === 4 || p === 5 ? "INSUFFICIENT_EVIDENCE" : "NO_MISCONCEPTION_DETECTED",
  })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Script => ({
    p,
    q: "q-read-vocab-drooping",
    ans: p === 1 || p === 6 ? "A" : "C",
    reason: p === 1 || p === 6 ? "plants grow" : "The soil was dry so the plants were hanging down.",
    cat: p === 1 || p === 6 ? "INSUFFICIENT_EVIDENCE" : "NO_MISCONCEPTION_DETECTED",
  })),
];

const MATH_SCRIPT: Script[] = [
  { p: 0, q: "q-math-frac-pizza", ans: "A", reason: "Noah because 8 is bigger than 4 so he has more", cat: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", quote: "8 is bigger than 4 so he has more", comebackCorrect: true },
  { p: 1, q: "q-math-frac-pizza", ans: "C", reason: "They both ate 3 pieces so it's the same", cat: "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT", quote: "They both ate 3 pieces so it's the same", comebackCorrect: true },
  { p: 2, q: "q-math-frac-pizza", ans: "B", reason: "fourths are bigger pieces than eighths", cat: "NO_MISCONCEPTION_DETECTED" },
  { p: 3, q: "q-math-frac-pizza", ans: "A", reason: "noah has more peices", cat: "INSUFFICIENT_EVIDENCE", clar: { text: "8 pieces is more than 4 pieces so its more pizza", cat: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", quote: "8 pieces is more than 4 pieces so its more pizza" }, comebackCorrect: false },
  { p: 4, q: "q-math-frac-pizza", ans: "B", reason: "3/4 = 6/8 and 6/8 is more than 3/8", cat: "NO_MISCONCEPTION_DETECTED" },
  { p: 5, q: "q-math-frac-pizza", ans: "C", reason: "same numerator", cat: "INSUFFICIENT_EVIDENCE", clar: "declined", comebackCorrect: true },
  { p: 6, q: "q-math-frac-pizza", ans: "A", reason: "fourths are bigger than eighths so Mia but I clicked Noah", cat: "SLIP_WITH_CORRECT_METHOD", quote: "fourths are bigger than eighths", comebackCorrect: true },
  { p: 7, q: "q-math-frac-pizza", ans: "B", reason: "the pizzas are the same size and 4 pieces are bigger than 8 pieces", cat: "NO_MISCONCEPTION_DETECTED" },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Script => ({
    p,
    q: "q-math-place-value",
    ans: p === 3 || p === 5 ? "B" : "C",
    reason: p === 3 || p === 5 ? "7 is in the hundreds" : "The 7 is in the thousands place.",
    cat: p === 3 || p === 5 ? "OTHER_MISCONCEPTION" : "NO_MISCONCEPTION_DETECTED",
    quote: p === 3 || p === 5 ? "7 is in the hundreds" : undefined,
  })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((p): Script => ({
    p,
    q: "q-math-add-library",
    ans: p === 0 || p === 3 || p === 6 ? "A" : "B",
    reason: p === 0 || p === 3 || p === 6 ? "I added them" : "1250 + 375 = 1625",
    cat: p === 0 || p === 3 || p === 6 ? "INSUFFICIENT_EVIDENCE" : "NO_MISCONCEPTION_DETECTED",
  })),
];

export interface DemoBundle {
  competitions: Competition[];
  participants: Participant[];
  attempts: Attempt[];
  analyses: Analysis[];
}

function wrongAnswer(q: Question): string {
  return q.answerChoices.find((c) => c.id !== q.correctAnswer)!.id;
}

function buildHistory(
  ownerId: string,
  subject: "reading" | "math",
  title: string,
  questionIds: string[],
  script: Script[],
  baseTime: number,
  takenCodes: Set<string>,
): DemoBundle {
  const bank = new Map(SEED_QUESTIONS.map((q) => [q.id, q]));
  const at = (mins: number) => new Date(baseTime + mins * 60_000).toISOString();
  const comp: Competition = {
    id: randomUUID(),
    ownerId,
    title,
    description: "Demonstration data: fictional participants and synthetic responses, generated to show the dashboard.",
    subject,
    gradeLevel: 5,
    status: "closed",
    roomCode: generateRoomCode(takenCodes),
    questionIds,
    isDemoData: true,
    isPracticeSpace: false,
    createdAt: at(0),
    openedAt: at(1),
    closedAt: at(60),
  };
  takenCodes.add(comp.roomCode);
  const participants: Participant[] = SYNTHETIC_NAMES.map((name) => ({
    id: randomUUID(),
    competitionId: comp.id,
    learnerId: null,
    nickname: `${name} (synthetic)`,
    isSynthetic: true,
    joinedAt: at(2),
  }));
  const attempts: Attempt[] = [];
  const analyses: Analysis[] = [];
  let minute = 3;

  for (const s of script) {
    const q = bank.get(s.q)!;
    const participant = participants[s.p];
    const isCorrect = s.ans === q.correctAnswer;
    const reasoningStatus = s.reason ? "provided" : "skipped";
    const attemptId = randomUUID();
    const mkAnalysis = (stage: Analysis["stage"], cat: Category, quote: string | undefined, needsClar: boolean): Analysis => ({
      id: randomUUID(),
      attemptId,
      stage,
      status: "completed",
      provider: "synthetic-demo",
      model: null,
      promptVersion: "synthetic-v1",
      category: cat,
      evidenceQuote: quote ?? null,
      explanation: "Synthetic demonstration classification (not produced by AI).",
      needsClarification: needsClar,
      clarificationQuestion: needsClar ? "Can you tell me more about how you decided?" : null,
      errorCode: null,
      isSynthetic: true,
      createdAt: at(minute),
    });

    const needsClar = Boolean(s.clar) && !isCorrect;
    const first = mkAnalysis("initial", s.cat, s.quote, needsClar);
    analyses.push(first);
    const followUp = q.followUpQuestionId ? bank.get(q.followUpQuestionId) ?? null : null;
    const routeFor = (analysis: Analysis, clarificationUsed: boolean) =>
      decideRoute({ question: q, isCorrect, reasoningStatus, analysis, clarificationUsed, practice: SEED_PRACTICE, followUp });

    let route = routeFor(first, false);
    let clarificationStatus: Attempt["clarificationStatus"] = "none";
    let clarificationText: string | null = null;
    if (s.clar && route.path === "clarify") {
      if (s.clar === "declined") {
        clarificationStatus = "declined";
        route = routeFor({ ...first, needsClarification: false, category: "INSUFFICIENT_EVIDENCE" }, true);
      } else {
        clarificationStatus = "answered";
        clarificationText = s.clar.text;
        const second = mkAnalysis("clarification", s.clar.cat, s.clar.quote, false);
        analyses.push(second);
        route = routeFor(second, true);
      }
    }

    const attempt: Attempt = {
      id: attemptId,
      participantId: participant.id,
      competitionId: comp.id,
      questionId: q.id,
      questionVersion: q.version,
      subject: q.subject,
      skill: q.skill,
      kind: "initial",
      originalAttemptId: null,
      selectedAnswer: s.ans,
      isCorrect,
      points: isCorrect ? FIRST_ATTEMPT_POINTS : 0,
      reasoning: s.reason,
      reasoningStatus,
      readAloudUsed: subject === "reading" && (s.p === 4 || s.p === 6),
      route,
      clarificationStatus,
      clarificationText,
      practiceCompletedAt: route.practiceResourceId ? at(minute + 1) : null,
      teacherReview: route.teacherReview,
      independent: true,
      support: "none",
      objectiveId: null,
      isSynthetic: true,
      createdAt: at(minute),
    };
    attempts.push(attempt);

    if (route.comebackQuestionId && !isCorrect && s.comebackCorrect !== undefined) {
      const fq = bank.get(route.comebackQuestionId)!;
      const correct = s.comebackCorrect;
      attempts.push({
        ...attempt,
        id: randomUUID(),
        questionId: fq.id,
        questionVersion: fq.version,
        kind: "comeback",
        originalAttemptId: attempt.id,
        selectedAnswer: correct ? fq.correctAnswer : wrongAnswer(fq),
        isCorrect: correct,
        points: correct ? COMEBACK_POINTS : 0,
        reasoning: correct ? "I used the clues this time." : "",
        reasoningStatus: correct ? "provided" : "skipped",
        route: null,
        clarificationStatus: "none",
        clarificationText: null,
        practiceCompletedAt: null,
        teacherReview: false,
        createdAt: at(minute + 2),
      });
    }
    minute += 3;
  }
  return { competitions: [comp], participants, attempts, analyses };
}

/** Demonstration history plus two open, empty "live" sprints for the given host. */
export function buildDemoBundle(ownerId: string, takenCodes: Set<string>, now = Date.now()): DemoBundle {
  const day = 86_400_000;
  const r = buildHistory(
    ownerId,
    "reading",
    "Demo history: Inference warm-up",
    ["q-read-inf-amina", "q-read-main-amina", "q-read-vocab-drooping"],
    READING_SCRIPT,
    now - 9 * day,
    takenCodes,
  );
  const m = buildHistory(
    ownerId,
    "math",
    "Demo history: Fraction warm-up",
    ["q-math-frac-pizza", "q-math-place-value", "q-math-add-library"],
    MATH_SCRIPT,
    now - 8 * day,
    takenCodes,
  );
  const live = (title: string, subject: "reading" | "math", questionIds: string[], description: string): Competition => {
    const c: Competition = {
      id: randomUUID(),
      ownerId,
      title,
      description,
      subject,
      gradeLevel: 5,
      status: "open",
      roomCode: generateRoomCode(takenCodes),
      questionIds,
      isDemoData: false,
      isPracticeSpace: false,
      createdAt: new Date(now).toISOString(),
      openedAt: new Date(now).toISOString(),
      closedAt: null,
    };
    takenCodes.add(c.roomCode);
    return c;
  };
  return {
    competitions: [
      ...r.competitions,
      ...m.competitions,
      live("Reading Rematch: Clue Detectives", "reading", ["q-read-inf-amina", "q-read-inf-kofi", "q-read-main-amina"], "Read short passages and explain which clues helped you."),
      live("Math Rematch: Fraction Face-off", "math", ["q-math-frac-pizza", "q-math-frac-juice", "q-math-place-value"], "Compare fractions and explain your thinking."),
    ],
    participants: [...r.participants, ...m.participants],
    attempts: [...r.attempts, ...m.attempts],
    analyses: [...r.analyses, ...m.analyses],
  };
}
