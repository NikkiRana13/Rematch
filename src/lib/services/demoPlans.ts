/**
 * FICTIONAL demonstration learning plans and learners. Every learner, participant, attempt and
 * analysis here is flagged synthetic; plans/competitions are flagged as demo data.
 * Attempt histories are written so that the real progress rule yields a mix of statuses.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { SEED_PRACTICE, SEED_QUESTIONS } from "../content/seed";
import { DEFAULT_EVIDENCE_RULE } from "../progress";
import { decideRoute } from "../routing";
import { COMEBACK_POINTS, FIRST_ATTEMPT_POINTS } from "../scoring";
import type {
  Analysis,
  Attempt,
  Category,
  Competition,
  Learner,
  LearningObjective,
  LearningPlan,
  ObjectiveQuestionMapping,
  Participant,
  PlanAssignment,
  PlanLecture,
  SkillId,
} from "../types";
import { hashToken } from "../auth/tokens";
import type { Db } from "../db/types";
import { generateRoomCode } from "./roomCode";

export interface DemoPlanBundle {
  competitions: Competition[];
  plans: LearningPlan[];
  lectures: PlanLecture[];
  objectives: LearningObjective[];
  mappings: ObjectiveQuestionMapping[];
  assignments: PlanAssignment[];
  learners: Learner[];
  participants: Participant[];
  attempts: Attempt[];
  analyses: Analysis[];
  /** Plain resume codes for the demo learners (returned once; only hashes are stored). */
  resumeCodes: { nickname: string; code: string }[];
  expected: Record<string, Record<string, string>>;
}

const Q = new Map(SEED_QUESTIONS.map((q) => [q.id, q]));

interface ObjSpec { key: string; text: string; skill: SkillId | null; questions: string[] }
interface LecSpec { number: number; title: string; objectives: ObjSpec[] }

const TERM_PLAN: LecSpec[] = [
  {
    number: 1,
    title: "Making inferences",
    objectives: [
      { key: "infer-clues", text: "Make an inference using clues from a short passage.", skill: "reading.inference", questions: ["q-read-inf-amina", "q-read-inf-kofi", "q-read-inf-mateo", "q-read-inf-patel", "q-read-inf-leo", "q-read-inf-priya"] },
      { key: "support-idea", text: "Choose the detail that best supports an idea.", skill: "reading.supporting_evidence", questions: ["q-read-evidence-kofi", "q-read-evidence-mateo", "q-read-evidence-patel", "q-read-evidence-leo"] },
    ],
  },
  {
    number: 2,
    title: "Comparing fractions",
    objectives: [
      { key: "denominator-meaning", text: "Explain what a denominator represents.", skill: "math.fractions_intro", questions: [] },
      { key: "same-numerator", text: "Compare fractions with the same numerator when the wholes are equal.", skill: "math.fractions_intro", questions: ["q-math-frac-pizza", "q-math-frac-juice", "q-math-frac-granola", "q-math-frac-paint", "q-math-frac-ribbon", "q-math-frac-garden"] },
      { key: "support-comparison", text: "Support a fraction comparison using a diagram or explanation.", skill: "math.fractions_intro", questions: [] },
    ],
  },
];

const FRACTIONS_COURSE: LecSpec[] = [
  {
    number: 5,
    title: "Comparing fractions",
    objectives: [
      { key: "fc-same-numerator", text: "Compare fractions with the same numerator.", skill: "math.fractions_intro", questions: ["q-math-frac-pizza", "q-math-frac-juice", "q-math-frac-granola", "q-math-frac-paint", "q-math-frac-ribbon", "q-math-frac-garden"] },
      { key: "fc-part-size", text: "Explain how the denominator changes the size of each part.", skill: "math.fractions_intro", questions: ["q-math-frac-pizza", "q-math-frac-paint", "q-math-frac-garden"] },
    ],
  },
];

type Step = { q: string; ans: string; kind?: "initial" | "roadmap"; reason?: string; cat?: Category; quote?: string; comeback?: { ans: string; reason: string }; repeat?: boolean };

const correct = (qid: string) => Q.get(qid)!.correctAnswer;

const LEARNERS: { nickname: string; steps: Step[] }[] = [
  {
    nickname: "Maya (demo)",
    steps: [
      { q: "q-read-inf-amina", ans: correct("q-read-inf-amina"), reason: "The soil was dry and the window was hot.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-inf-kofi", ans: correct("q-read-inf-kofi"), reason: "Two trays were empty and people were lining up.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-evidence-kofi", ans: correct("q-read-evidence-kofi"), reason: "Empty trays show people bought them.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-math-frac-pizza", ans: "A", reason: "8 is bigger than 4 so Noah has more", cat: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", quote: "8 is bigger than 4 so Noah has more", comeback: { ans: correct("q-math-frac-ribbon"), reason: "Fifths are bigger pieces than ninths." } },
      { q: "q-math-frac-juice", ans: correct("q-math-frac-juice"), reason: "Thirds are bigger pieces than fifths.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-inf-mateo", kind: "roadmap", ans: correct("q-read-inf-mateo"), reason: "It was pouring so he kept the book dry.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-evidence-mateo", kind: "roadmap", ans: correct("q-read-evidence-mateo"), reason: "Pouring means heavy rain.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-evidence-patel", kind: "roadmap", ans: correct("q-read-evidence-patel"), reason: "The card says get well soon.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-math-frac-granola", kind: "roadmap", ans: correct("q-math-frac-granola"), reason: "Thirds are bigger than fifths.", cat: "NO_MISCONCEPTION_DETECTED" },
    ],
  },
  {
    nickname: "Theo (demo)",
    steps: [
      { q: "q-read-inf-amina", ans: "B", reason: "The teacher told her because teachers look after plants.", cat: "UNSUPPORTED_INFERENCE", quote: "teachers look after plants", comeback: { ans: "A", reason: "His jacket was torn." } },
      { q: "q-read-inf-kofi", ans: correct("q-read-inf-kofi"), reason: "People were still lining up.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-evidence-kofi", ans: "A", reason: "They had three trays.", cat: "INSUFFICIENT_EVIDENCE" },
      { q: "q-math-frac-pizza", ans: "C", reason: "They both ate 3 pieces so it's the same.", cat: "SAME_NUMERATOR_MEANS_EQUAL_AMOUNT", quote: "They both ate 3 pieces so it's the same", comeback: { ans: correct("q-math-frac-ribbon"), reason: "Fifths are bigger than ninths." } },
      { q: "q-math-frac-juice", ans: "A", reason: "5 is bigger than 3 so Sam poured more.", cat: "LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT", quote: "5 is bigger than 3 so Sam poured more" },
      { q: "q-read-inf-amina", kind: "roadmap", ans: correct("q-read-inf-amina"), reason: "The soil was dry.", cat: "NO_MISCONCEPTION_DETECTED", repeat: true },
    ],
  },
  {
    nickname: "Sam (demo)",
    steps: [
      { q: "q-math-frac-pizza", ans: correct("q-math-frac-pizza"), reason: "Fourths are bigger pieces than eighths.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-math-frac-juice", ans: correct("q-math-frac-juice"), reason: "Thirds are bigger than fifths.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-math-frac-paint", ans: correct("q-math-frac-paint"), reason: "Sixths are bigger parts than tenths.", cat: "NO_MISCONCEPTION_DETECTED" },
      { q: "q-read-inf-amina", ans: correct("q-read-inf-amina"), reason: "The window was hot and the soil was dry.", cat: "NO_MISCONCEPTION_DETECTED" },
    ],
  },
  { nickname: "Zara (demo)", steps: [] },
];

function resumeCode(): string {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function buildDemoPlans(ownerId: string, takenCodes: Set<string>, extraAssignCompetitionIds: string[] = [], now = Date.now()): DemoPlanBundle {
  const iso = (mins: number) => new Date(now - 5 * 86_400_000 + mins * 60_000).toISOString();
  const mkComp = (title: string, practice: boolean, questionIds: string[], subject: "reading" | "math"): Competition => {
    const roomCode = generateRoomCode(takenCodes);
    takenCodes.add(roomCode);
    return {
      id: randomUUID(),
      ownerId,
      title,
      description: practice ? "Hidden practice space for learning-plan rematches." : "Demonstration classroom for the learning-plan roadmap (fictional students).",
      subject,
      gradeLevel: 5,
      status: practice ? "open" : "closed",
      roomCode,
      questionIds,
      isDemoData: true,
      isPracticeSpace: practice,
      createdAt: iso(0),
      openedAt: iso(0),
      closedAt: practice ? null : iso(600),
    };
  };
  // Competitions are single-subject (as the editor enforces), so the demo class has a reading and a math sprint.
  const readingComp = mkComp("Room 5B Roadmap Class: Reading (demo)", false, ["q-read-inf-amina", "q-read-inf-kofi", "q-read-evidence-kofi"], "reading");
  const mathComp = mkComp("Room 5B Roadmap Class: Math (demo)", false, ["q-math-frac-pizza", "q-math-frac-juice", "q-math-frac-paint"], "math");
  const out: DemoPlanBundle = { competitions: [readingComp, mathComp], plans: [], lectures: [], objectives: [], mappings: [], assignments: [], learners: [], participants: [], attempts: [], analyses: [], resumeCodes: [], expected: {} };

  const objectiveIdsByKey = new Map<string, string>();
  const mkPlan = (title: string, courseLabel: string, subject: LearningPlan["subject"], unitLabel: "Lecture" | "Lesson", spec: LecSpec[], description: string) => {
    const practice = mkComp(`Roadmap practice: ${title}`, true, [], subject === "math" ? "math" : "reading");
    out.competitions.push(practice);
    const plan: LearningPlan = {
      id: randomUUID(), ownerId, title, subject, courseLabel, description, unitLabel, status: "published", publishedVersion: 1, draftVersion: null,
      evidenceRule: DEFAULT_EVIDENCE_RULE, source: "manual", practiceCompetitionId: practice.id, isDemoData: true, createdAt: iso(1), updatedAt: iso(1),
    };
    out.plans.push(plan);
    spec.forEach((l, li) => {
      const lecture: PlanLecture = { id: randomUUID(), planId: plan.id, planVersion: 1, position: li, number: l.number, title: l.title };
      out.lectures.push(lecture);
      l.objectives.forEach((o, oi) => {
        const objective: LearningObjective = { id: randomUUID(), planId: plan.id, planVersion: 1, lectureId: lecture.id, objectiveKey: o.key, position: oi, text: o.text, skill: o.skill, required: true, needsReview: false, reviewNote: null, sourceQuote: null };
        out.objectives.push(objective);
        objectiveIdsByKey.set(`${plan.title}:${o.key}`, objective.id);
        for (const qid of o.questions) out.mappings.push({ id: randomUUID(), objectiveId: objective.id, planId: plan.id, planVersion: 1, questionId: qid });
      });
    });
    for (const cid of [readingComp.id, mathComp.id, ...extraAssignCompetitionIds]) out.assignments.push({ id: randomUUID(), planId: plan.id, competitionId: cid, createdAt: iso(2) });
    return { plan, practice };
  };
  const term = mkPlan("Grade 5 Term 1 Learning Plan (demo)", "Grade 5 · Room 5B", "mixed", "Lesson", TERM_PLAN, "Fictional demo plan: inference, supporting evidence, and fraction comparison.");
  const course = mkPlan("Fractions mini-course (demo)", "Demo course · Fractions", "math", "Lecture", FRACTIONS_COURSE, "Fictional demo plan using university-style lecture numbering.");

  let minute = 10;
  for (const spec of LEARNERS) {
    const code = resumeCode();
    const learner: Learner = { id: randomUUID(), tokenHash: hashToken(`demo-unusable:${randomUUID()}`), nickname: spec.nickname, resumeCodeHash: hashToken(`resume:${code}`), isSynthetic: true, createdAt: iso(5) };
    out.learners.push(learner);
    out.resumeCodes.push({ nickname: spec.nickname, code: code.match(/.{4}/g)!.join("-") });
    const readPart: Participant = { id: randomUUID(), competitionId: readingComp.id, learnerId: learner.id, nickname: spec.nickname, isSynthetic: true, joinedAt: iso(6) };
    const mathPart: Participant = { id: randomUUID(), competitionId: mathComp.id, learnerId: learner.id, nickname: spec.nickname, isSynthetic: true, joinedAt: iso(6) };
    const practicePart: Participant = { id: randomUUID(), competitionId: term.practice.id, learnerId: learner.id, nickname: spec.nickname, isSynthetic: true, joinedAt: iso(6) };
    out.participants.push(readPart, mathPart, practicePart);
    const seen = new Set<string>();

    for (const s of spec.steps) {
      const q = Q.get(s.q)!;
      const kind = s.kind ?? "initial";
      const part = kind === "roadmap" ? practicePart : q.subject === "reading" ? readPart : mathPart;
      const isCorrect = s.ans === q.correctAnswer;
      const independent = !seen.has(q.id);
      seen.add(q.id);
      const attemptId = randomUUID();
      const analysis: Analysis = {
        id: randomUUID(), attemptId, stage: "initial", status: "completed", provider: "synthetic-demo", model: null, promptVersion: "synthetic-v1",
        category: s.cat ?? "NO_MISCONCEPTION_DETECTED", evidenceQuote: s.quote ?? null, explanation: "Demonstration classification for a fictional student.",
        needsClarification: false, clarificationQuestion: null, errorCode: null, isSynthetic: true, createdAt: iso(minute),
      };
      const followUp = q.followUpQuestionId ? Q.get(q.followUpQuestionId)! : null;
      const route = decideRoute({ question: q, isCorrect, reasoningStatus: "provided", analysis, clarificationUsed: false, practice: SEED_PRACTICE, followUp });
      const attempt: Attempt = {
        id: attemptId, participantId: part.id, competitionId: part.competitionId, questionId: q.id, questionVersion: q.version, subject: q.subject, skill: q.skill,
        kind, originalAttemptId: null, selectedAnswer: s.ans, isCorrect, points: kind === "initial" && isCorrect ? FIRST_ATTEMPT_POINTS : 0,
        reasoning: s.reason ?? "", reasoningStatus: s.reason ? "provided" : "skipped", readAloudUsed: false, route, clarificationStatus: "none", clarificationText: null,
        practiceCompletedAt: route.practiceResourceId ? iso(minute + 1) : null, teacherReview: route.teacherReview,
        independent, support: independent ? "none" : "answer_previously_revealed", objectiveId: null, isSynthetic: true, createdAt: iso(minute),
      };
      out.attempts.push(attempt);
      out.analyses.push(analysis);
      minute += 3;
      if (s.comeback && route.comebackQuestionId) {
        const fq = Q.get(route.comebackQuestionId)!;
        const cbCorrect = s.comeback.ans === fq.correctAnswer;
        const cbIndependent = !seen.has(fq.id);
        seen.add(fq.id);
        out.attempts.push({
          ...attempt, id: randomUUID(), questionId: fq.id, questionVersion: fq.version, kind: "comeback", originalAttemptId: attempt.id, selectedAnswer: s.comeback.ans,
          isCorrect: cbCorrect, points: cbCorrect && kind === "initial" ? COMEBACK_POINTS : 0, reasoning: s.comeback.reason, route: null, practiceCompletedAt: null, teacherReview: false,
          independent: cbIndependent, support: cbIndependent ? "none" : "answer_previously_revealed", createdAt: iso(minute),
        });
        minute += 3;
      }
      void s.repeat;
    }
  }
  const k = (plan: string, key: string) => objectiveIdsByKey.get(`${plan}:${key}`)!;
  const T = "Grade 5 Term 1 Learning Plan (demo)";
  out.expected = {
    "Maya (demo)": { [k(T, "infer-clues")]: "demonstrated", [k(T, "support-idea")]: "demonstrated", [k(T, "same-numerator")]: "demonstrated", [k(T, "denominator-meaning")]: "not_assessed" },
    "Theo (demo)": { [k(T, "infer-clues")]: "needs_practice", [k(T, "support-idea")]: "in_progress", [k(T, "same-numerator")]: "needs_practice" },
    "Sam (demo)": { [k(T, "same-numerator")]: "in_progress", [k(T, "infer-clues")]: "in_progress" },
    "Zara (demo)": { [k(T, "infer-clues")]: "not_assessed", [k(T, "same-numerator")]: "not_assessed" },
  };
  void course;
  return out;
}


/** Inserts a demo plan bundle in foreign-key order. */
export async function insertDemoPlans(db: Db, b: DemoPlanBundle): Promise<void> {
  for (const c of b.competitions) await db.insert("competitions", c);
  for (const p of b.plans) await db.insert("learning_plans", p);
  for (const l of b.lectures) await db.insert("learning_plan_lectures", l);
  for (const o of b.objectives) await db.insert("learning_objectives", o);
  for (const m of b.mappings) await db.insert("objective_question_mappings", m);
  for (const a of b.assignments) await db.insert("learning_plan_assignments", a);
  for (const l of b.learners) await db.insert("learners", l);
  for (const p of b.participants) await db.insert("participants", p);
  for (const a of b.attempts.filter((x) => x.kind !== "comeback")) await db.insert("attempts", a);
  for (const a of b.attempts.filter((x) => x.kind === "comeback")) await db.insert("attempts", a);
  for (const a of b.analyses) await db.insert("analyses", a);
}
