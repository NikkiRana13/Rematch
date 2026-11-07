import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertCompetitionOpen, assertLearnerOwnsParticipant, assertParticipantOwnsAttempt, AuthzError } from "../authz";
import { categoryInfo, isMisconceptionCode, skillInfo } from "../content/taxonomy";
import { learnerProgress, latestAnalysisByAttempt } from "../analytics";
import type { ReasoningAnalyzer } from "../analysis/types";
import type { Db } from "../db/types";
import { UniqueViolationError } from "../db/types";
import { decideRoute, nextStep, type NextStep } from "../routing";
import { toStudentPractice, toStudentQuestion } from "../sanitize";
import { scoreComeback, scoreInitial, ScoringError, summarizeScore } from "../scoring";
import type { Analysis, Attempt, Competition, Learner, Participant, Question, Route } from "../types";
import { hashToken, newLearnerToken } from "../auth/tokens";
import { analyzeAndStore } from "./analyze";
import { ServiceError } from "./errors";
import { normalizeRoomCode } from "./roomCode";

export const JoinInput = z.object({
  roomCode: z.string().trim().min(4).max(12),
  nickname: z
    .string()
    .trim()
    .min(1, "Please enter a nickname.")
    .max(24, "Nicknames can be up to 24 characters.")
    .regex(/^[\p{L}\p{N} _'.-]+$/u, "Use letters, numbers, and spaces only."),
});

export const AnswerInput = z.object({
  questionId: z.string().min(1).max(100),
  selectedAnswer: z.string().min(1).max(10),
  reasoning: z.string().max(2000).default(""),
  reasoningStatus: z.enum(["provided", "not_sure", "skipped"]),
  readAloudUsed: z.boolean().default(false),
});

export const ClarifyInput = z.union([
  z.object({ declined: z.literal(true) }),
  z.object({ text: z.string().trim().min(1).max(1000) }),
]);

/**
 * Independence: an attempt counts as independent evidence only if this learner has never
 * attempted the question before (feedback reveals answers, so a repeat is not new evidence).
 */
export async function exposure(
  db: Db,
  participant: Pick<Participant, "id" | "learnerId">,
  questionId: string,
): Promise<Pick<Attempt, "independent" | "support">> {
  const participantIds = participant.learnerId
    ? (await db.select("participants", { eq: { learnerId: participant.learnerId } })).map((p) => p.id)
    : [participant.id];
  const prior = participantIds.length
    ? await db.select("attempts", { eq: { questionId }, in: { column: "participantId", values: participantIds } })
    : [];
  return prior.length ? { independent: false, support: "answer_previously_revealed" } : { independent: true, support: "none" };
}

async function loadCompetition(db: Db, id: string): Promise<Competition> {
  const [c] = await db.select("competitions", { eq: { id } });
  if (!c) throw new AuthzError(404, "Competition not found.");
  return c;
}

async function loadQuestion(db: Db, id: string): Promise<Question> {
  const [q] = await db.select("questions", { eq: { id } });
  if (!q) throw new ServiceError(404, "question_not_found", "Question not found.");
  return q;
}

async function loadPassage(db: Db, q: Question) {
  if (!q.passageId) return null;
  const [p] = await db.select("passages", { eq: { id: q.passageId } });
  return p ?? null;
}

export async function joinCompetition(
  db: Db,
  learner: Learner | null,
  input: z.infer<typeof JoinInput>,
): Promise<{ learner: Learner; newToken: string | null; participant: Participant; competition: Competition }> {
  const code = normalizeRoomCode(input.roomCode);
  const [competition] = await db.select("competitions", { eq: { roomCode: code } });
  if (!competition || competition.isPracticeSpace)
    throw new ServiceError(404, "room_not_found", "We couldn't find a competition with that code.");
  if (competition.status !== "open")
    throw new ServiceError(403, "room_not_open", "That competition isn't open right now. Ask your host!");

  let newToken: string | null = null;
  let me = learner;
  if (!me) {
    newToken = newLearnerToken();
    me = await db.insert("learners", {
      id: randomUUID(),
      tokenHash: hashToken(newToken),
      nickname: input.nickname,
      resumeCodeHash: null,
      isSynthetic: false,
      createdAt: new Date().toISOString(),
    });
  }
  const [existing] = await db.select("participants", { eq: { competitionId: competition.id, learnerId: me.id } });
  if (existing) return { learner: me, newToken, participant: existing, competition };
  try {
    const participant = await db.insert("participants", {
      id: randomUUID(),
      competitionId: competition.id,
      learnerId: me.id,
      nickname: input.nickname,
      isSynthetic: false,
      joinedAt: new Date().toISOString(),
    });
    return { learner: me, newToken, participant, competition };
  } catch (e) {
    if (e instanceof UniqueViolationError) {
      const [again] = await db.select("participants", { eq: { competitionId: competition.id, learnerId: me.id } });
      if (again) return { learner: me, newToken, participant: again, competition };
    }
    throw e;
  }
}

async function loadParticipantContext(db: Db, learner: Learner | null, competitionId: string) {
  if (!learner) throw new AuthzError(401, "Join with a room code to continue.");
  const competition = await loadCompetition(db, competitionId);
  const [participant] = await db.select("participants", { eq: { competitionId, learnerId: learner.id } });
  assertLearnerOwnsParticipant(learner, participant ?? null);
  const attempts = await db.select("attempts", { eq: { participantId: participant.id } });
  const analyses = attempts.length
    ? await db.select("analyses", { in: { column: "attemptId", values: attempts.map((a) => a.id) } })
    : [];
  return { competition, participant, attempts, analyses };
}

function publicCompetition(c: Competition) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    subject: c.subject,
    gradeLevel: c.gradeLevel,
    status: c.status,
    questionCount: c.questionIds.length,
  };
}

export async function getPlayState(db: Db, learner: Learner | null, competitionId: string) {
  const { competition, participant, attempts, analyses } = await loadParticipantContext(db, learner, competitionId);
  const latest = latestAnalysisByAttempt(analyses);
  let step: NextStep = nextStep(competition.questionIds, attempts, latest);
  if (competition.status !== "open" && step.type !== "done") step = { type: "closed" };

  const score = summarizeScore(attempts);
  const base = {
    competition: publicCompetition(competition),
    participant: { id: participant.id, nickname: participant.nickname },
    score,
    progress: {
      answered: competition.questionIds.filter((qid) => attempts.some((a) => a.kind === "initial" && a.questionId === qid)).length,
      total: competition.questionIds.length,
    },
  };

  if (step.type === "question" || step.type === "comeback") {
    const q = await loadQuestion(db, step.questionId);
    const passage = await loadPassage(db, q);
    return { ...base, step, question: toStudentQuestion(q, passage) };
  }
  if (step.type === "practice") {
    const [p] = await db.select("practice_resources", { eq: { id: step.practiceResourceId } });
    const attempt = attempts.find((a) => a.id === step.attemptId)!;
    const q = await loadQuestion(db, attempt.questionId);
    return {
      ...base,
      step,
      practice: p ? toStudentPractice(p) : null,
      feedback: studentFeedback(q, attempt, latest.get(attempt.id) ?? null, attempt.route),
    };
  }
  if (step.type === "clarify") {
    const attempt = attempts.find((a) => a.id === step.attemptId)!;
    const q = await loadQuestion(db, attempt.questionId);
    const passage = await loadPassage(db, q);
    return { ...base, step, question: toStudentQuestion(q, passage), yourReasoning: attempt.reasoning };
  }
  return { ...base, step };
}

/** Student-facing feedback. Celebrates progress; never labels the student; never reveals follow-up answers. */
export function studentFeedback(q: Question, attempt: Attempt, analysis: Analysis | null, route: Route | null) {
  const correctChoice = q.answerChoices.find((c) => c.id === q.correctAnswer);
  const revealAnswer = attempt.isCorrect || route?.path !== "clarify";
  let message: string;
  let idea: string | null = null;
  if (attempt.kind === "roadmap") {
    message = attempt.isCorrect
      ? attempt.independent
        ? "Correct — that's new evidence for this objective."
        : "Correct! You'd seen this question before, so it counts as practice rather than new evidence."
      : route?.path === "clarify"
        ? "Thanks for explaining! Before we move on, can you tell us a little more?"
        : "Not quite yet — let's practise, then try a fresh question.";
  } else if (attempt.kind === "comeback") {
    message = attempt.isCorrect
      ? "You used what you practised — nice work."
      : "Thanks for trying the comeback question. Every attempt helps you and your teacher see what to practise next.";
  } else if (attempt.isCorrect) {
    message = "Nice work — that's correct! +100 points.";
    if (route?.path === "optional_targeted_practice")
      message += " Your answer is right. There's an optional practice card if you'd like to sharpen your explanation.";
  } else if (route?.path === "clarify") {
    message = "Thanks for explaining! Before we move on, can you tell us a little more?";
  } else {
    message = "Not quite this time — and that's how learning works. Let's practise, then try a comeback question.";
    if (!route?.comebackQuestionId) message = "Not quite this time. Let's look at how this one works.";
  }
  const cat = analysis?.status === "completed" ? analysis.category : null;
  if (!attempt.isCorrect && cat && route?.path === "targeted_practice" && isMisconceptionCode(cat)) {
    idea = `It looks like you might be ${categoryInfo(cat).studentLabel}. Lots of people think this way at first — let's check it together.`;
  } else if (!attempt.isCorrect && cat === "SLIP_WITH_CORRECT_METHOD") {
    idea = "Your explanation was on track — it may have been a small slip.";
  }
  return {
    isCorrect: attempt.isCorrect,
    points: attempt.points,
    kind: attempt.kind,
    message,
    idea,
    analysisSource:
      analysis?.status === "completed"
        ? analysis.provider === "anthropic"
          ? "ai"
          : analysis.provider.startsWith("rule")
            ? "rule-based"
            : "other"
        : analysis
          ? "unavailable"
          : null,
    correctAnswerText: revealAnswer ? (correctChoice?.text ?? null) : null,
    explanation: revealAnswer ? q.referenceExplanation : null,
    adaptiveSupport: route?.adaptiveSupport ?? false,
    nextPath: route?.path ?? "continue",
  };
}

export async function computeAndStoreRoute(
  db: Db,
  attempt: Attempt,
  question: Question,
  analysis: Analysis | null,
  clarificationUsed: boolean,
  extra: Partial<Attempt> = {},
): Promise<Attempt> {
  const practice = await db.select("practice_resources", { eq: { skill: question.skill } });
  const followUp = question.followUpQuestionId ? (await db.select("questions", { eq: { id: question.followUpQuestionId } }))[0] ?? null : null;
  const route = decideRoute({
    question,
    isCorrect: attempt.isCorrect,
    reasoningStatus: attempt.reasoningStatus,
    analysis,
    clarificationUsed,
    practice,
    followUp,
  });
  const patch: Partial<Attempt> = {
    ...extra,
    route,
    teacherReview: route.teacherReview,
    clarificationStatus: route.path === "clarify" ? "requested" : (extra.clarificationStatus ?? attempt.clarificationStatus),
  };
  const [updated] = await db.update("attempts", { id: attempt.id }, patch);
  return updated ?? { ...attempt, ...patch };
}

export async function submitInitialAnswer(
  db: Db,
  analyzer: ReasoningAnalyzer,
  learner: Learner | null,
  competitionId: string,
  input: z.infer<typeof AnswerInput>,
) {
  const { competition, participant } = await loadParticipantContext(db, learner, competitionId);
  assertCompetitionOpen(competition);
  if (!competition.questionIds.includes(input.questionId))
    throw new ServiceError(400, "question_not_in_competition", "That question isn't part of this competition.");
  const question = await loadQuestion(db, input.questionId);
  const passage = await loadPassage(db, question);

  let scored: { isCorrect: boolean; points: number };
  try {
    scored = scoreInitial(question, input.selectedAnswer);
  } catch (e) {
    if (e instanceof ScoringError) throw new ServiceError(400, e.code, e.message);
    throw e;
  }
  const reasoning = input.reasoningStatus === "provided" ? input.reasoning.trim() : "";
  const reasoningStatus = input.reasoningStatus === "provided" && !reasoning ? "skipped" : input.reasoningStatus;

  // 1. Persist answer + reasoning BEFORE any feedback is produced.
  let attempt: Attempt;
  try {
    attempt = await db.insert("attempts", {
      id: randomUUID(),
      participantId: participant.id,
      competitionId,
      questionId: question.id,
      questionVersion: question.version,
      subject: question.subject,
      skill: question.skill,
      kind: "initial",
      originalAttemptId: null,
      selectedAnswer: input.selectedAnswer,
      isCorrect: scored.isCorrect,
      points: scored.points,
      reasoning,
      reasoningStatus,
      readAloudUsed: input.readAloudUsed,
      route: null,
      clarificationStatus: "none",
      clarificationText: null,
      practiceCompletedAt: null,
      teacherReview: false,
      ...(await exposure(db, participant, question.id)),
      objectiveId: null,
      isSynthetic: false,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof UniqueViolationError)
      throw new ServiceError(409, "duplicate_submission", "You've already answered this question. No extra points are added.");
    throw e;
  }

  // 2. Analyse reasoning separately; failures are stored as "unavailable".
  let analysis: Analysis | null = null;
  try {
    analysis = await analyzeAndStore({ db, analyzer, attempt, question, passage, stage: "initial" });
  } catch (e) {
    console.error("[analysis] storing analysis failed", e);
  }
  // 3. Rule-based routing (never changes the score).
  attempt = await computeAndStoreRoute(db, attempt, question, analysis, false);
  return {
    feedback: studentFeedback(question, attempt, analysis, attempt.route),
    clarificationQuestion: attempt.route?.path === "clarify" ? analysis?.clarificationQuestion ?? null : null,
  };
}

export async function submitClarification(
  db: Db,
  analyzer: ReasoningAnalyzer,
  learner: Learner | null,
  competitionId: string,
  attemptId: string,
  input: z.infer<typeof ClarifyInput>,
) {
  const { competition, participant, attempts, analyses } = await loadParticipantContext(db, learner, competitionId);
  assertCompetitionOpen(competition);
  const attempt = assertParticipantOwnsAttempt(participant, attempts.find((a) => a.id === attemptId) ?? null);
  const question = await loadQuestion(db, attempt.questionId);
  const declined = "declined" in input;
  // Compare-and-set: only one clarification is ever accepted.
  const [updated] = await db.update(
    "attempts",
    { id: attempt.id, clarificationStatus: "requested" },
    declined ? { clarificationStatus: "declined" } : { clarificationStatus: "answered", clarificationText: input.text },
  );
  if (!updated) throw new ServiceError(409, "clarification_closed", "This clarification has already been answered.");

  let analysis: Analysis | null = latestAnalysisByAttempt(analyses).get(attempt.id) ?? null;
  if (!declined) {
    try {
      analysis = await analyzeAndStore({
        db,
        analyzer,
        attempt: updated,
        question,
        passage: await loadPassage(db, question),
        stage: "clarification",
      });
    } catch (e) {
      console.error("[analysis] clarification analysis failed", e);
      analysis = null;
    }
  }
  const routed = await computeAndStoreRoute(db, updated, question, analysis, true, {
    clarificationStatus: updated.clarificationStatus,
  });
  return { feedback: studentFeedback(question, routed, analysis, routed.route) };
}

export async function completePractice(db: Db, learner: Learner | null, competitionId: string, attemptId: string) {
  const { participant, attempts } = await loadParticipantContext(db, learner, competitionId);
  const attempt = assertParticipantOwnsAttempt(participant, attempts.find((a) => a.id === attemptId) ?? null);
  if (!attempt.route?.practiceResourceId) throw new ServiceError(400, "no_practice", "No practice for this attempt.");
  await db.update("attempts", { id: attempt.id, practiceCompletedAt: null }, { practiceCompletedAt: new Date().toISOString() });
  return { ok: true };
}

export async function submitComeback(
  db: Db,
  analyzer: ReasoningAnalyzer,
  learner: Learner | null,
  competitionId: string,
  attemptId: string,
  input: z.infer<typeof AnswerInput>,
) {
  const { competition, participant, attempts } = await loadParticipantContext(db, learner, competitionId);
  assertCompetitionOpen(competition);
  const original = assertParticipantOwnsAttempt(participant, attempts.find((a) => a.id === attemptId) ?? null);
  if (input.questionId !== original.route?.comebackQuestionId)
    throw new ServiceError(400, "wrong_question", "That isn't the comeback question for this attempt.");
  const followUp = await loadQuestion(db, input.questionId);
  let scored: { isCorrect: boolean; points: number };
  try {
    scored = scoreComeback(original, followUp, input.selectedAnswer);
  } catch (e) {
    if (e instanceof ScoringError) throw new ServiceError(400, e.code, e.message);
    throw e;
  }
  const reasoning = input.reasoningStatus === "provided" ? input.reasoning.trim() : "";
  let attempt: Attempt;
  try {
    attempt = await db.insert("attempts", {
      id: randomUUID(),
      participantId: participant.id,
      competitionId,
      questionId: followUp.id,
      questionVersion: followUp.version,
      subject: followUp.subject,
      skill: followUp.skill,
      kind: "comeback",
      originalAttemptId: original.id,
      selectedAnswer: input.selectedAnswer,
      isCorrect: scored.isCorrect,
      points: scored.points,
      reasoning,
      reasoningStatus: input.reasoningStatus === "provided" && !reasoning ? "skipped" : input.reasoningStatus,
      readAloudUsed: input.readAloudUsed,
      route: null,
      clarificationStatus: "none",
      clarificationText: null,
      practiceCompletedAt: null,
      teacherReview: false,
      ...(await exposure(db, participant, followUp.id)),
      objectiveId: null,
      isSynthetic: false,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof UniqueViolationError)
      throw new ServiceError(409, "duplicate_submission", "You've already tried this comeback. No extra points are added.");
    throw e;
  }
  let analysis: Analysis | null = null;
  try {
    analysis = await analyzeAndStore({
      db,
      analyzer,
      attempt,
      question: followUp,
      passage: await loadPassage(db, followUp),
      stage: "initial",
    });
  } catch (e) {
    console.error("[analysis] comeback analysis failed", e);
  }
  return { feedback: studentFeedback(followUp, attempt, analysis, null) };
}

export async function getResults(db: Db, learner: Learner | null, competitionId: string) {
  const { competition, participant, attempts } = await loadParticipantContext(db, learner, competitionId);
  const qIds = [...new Set(attempts.map((a) => a.questionId))];
  const questions = qIds.length ? await db.select("questions", { in: { column: "id", values: qIds } }) : [];
  const qById = new Map(questions.map((q) => [q.id, q]));
  const items = attempts
    .filter((a) => a.kind === "initial")
    .sort((a, b) => competition.questionIds.indexOf(a.questionId) - competition.questionIds.indexOf(b.questionId))
    .map((a) => {
      const q = qById.get(a.questionId)!;
      const cb = attempts.find((x) => x.kind === "comeback" && x.originalAttemptId === a.id);
      return {
        prompt: q.prompt,
        skill: q.skill,
        skillLabel: skillInfo(q.skill).label,
        isCorrect: a.isCorrect,
        points: a.points,
        // Answers are revealed only for questions this participant has already attempted.
        correctAnswerText: q.answerChoices.find((c) => c.id === q.correctAnswer)?.text ?? null,
        explanation: q.referenceExplanation,
        comeback: cb ? { isCorrect: cb.isCorrect, points: cb.points } : null,
      };
    });
  return {
    competition: publicCompetition(competition),
    nickname: participant.nickname,
    score: summarizeScore(attempts),
    items,
    skills: learnerProgress(attempts).map((s) => ({ ...s, label: skillInfo(s.skill).label })),
  };
}

/** Student home: sprints joined on this device and progress by subject/skill. */
export async function getLearnerHome(db: Db, learner: Learner | null) {
  if (!learner) return null;
  const participants = await db.select("participants", { eq: { learnerId: learner.id } });
  const competitions = participants.length
    ? await db.select("competitions", { in: { column: "id", values: participants.map((p) => p.competitionId) } })
    : [];
  const attempts = participants.length
    ? await db.select("attempts", { in: { column: "participantId", values: participants.map((p) => p.id) } })
    : [];
  return {
    nickname: learner.nickname,
    sprints: competitions.filter((c) => !c.isPracticeSpace).map((c) => {
      const mine = attempts.filter((a) => a.competitionId === c.id);
      const answered = c.questionIds.filter((qid) => mine.some((a) => a.kind === "initial" && a.questionId === qid)).length;
      return { ...publicCompetition(c), answered, ...summarizeScore(mine) };
    }),
    progress: learnerProgress(attempts).map((s) => ({ ...s, label: skillInfo(s.skill).label })),
  };
}
