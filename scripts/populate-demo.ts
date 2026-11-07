/**
 * Populates a Supabase project with demo classrooms: two demo host accounts, several
 * competitions, and FICTIONAL students whose responses are driven through the real
 * services (scoring, analysis, routing, clarification, practice, comeback).
 * Afterwards every dummy participant/attempt/analysis is flagged synthetic and labelled.
 *
 *   npm run populate:demo            # create (fails if demo competitions already exist)
 *   npm run populate:demo -- --reset # delete the demo hosts' competitions first
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and REMATCH_DEMO_HOST_PASSWORD.
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_PASSAGES, SEED_PRACTICE, SEED_QUESTIONS } from "../src/lib/content/seed";
import { SupabaseDb } from "../src/lib/db/supabase";
import { RuleBasedAnalyzer } from "../src/lib/analysis/ruleBased";
import { createCompetition, setCompetitionStatus } from "../src/lib/services/host";
import {
  completePractice,
  getPlayState,
  joinCompetition,
  submitClarification,
  submitComeback,
  submitInitialAnswer,
} from "../src/lib/services/play";
import type { Host, Learner } from "../src/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const password = process.env.REMATCH_DEMO_HOST_PASSWORD!;
if (!url || !serviceKey || !password) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REMATCH_DEMO_HOST_PASSWORD");

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const db = new SupabaseDb(url, serviceKey);
const analyzer = new RuleBasedAnalyzer();

// Deterministic randomness so reruns produce the same classroom.
let seed = 20261107;
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Resp = [answer: string, reasoning: string];
const ADAPTIVE: Record<string, Record<string, Resp>> = {
  "q-read-inf-amina": {
    correct: ["C", "The soil was dry and the window was hot, so she moved it so the soil would stay wet."],
    unsup: ["B", "Her teacher probably told her to because teachers take care of the class plants."],
    explicit: ["A", "It doesn't say why she moved it so I just picked one."],
    vague: ["D", "idk"],
  },
  "q-read-inf-kofi": {
    correct: ["D", "Two trays were empty and people were still lining up, so lots of people wanted them."],
    unsup: ["C", "The muffins were probably free because schools give food away at events."],
    explicit: ["A", "The story does not say if people liked them so you can't know."],
    vague: ["B", "i guessed"],
  },
  "q-read-inf-mateo": {
    correct: ["B", "It was pouring so he put the book in his raincoat to keep it dry."],
    unsup: ["A", "He wanted to hide it because he forgot to return it last week."],
    explicit: ["C", "It never says why he did it so I can't tell."],
    vague: ["D", "because"],
  },
  "q-read-inf-patel": {
    correct: ["C", "The card said Get Well Soon so she was probably sick."],
    unsup: ["B", "The students were quiet because they broke something and were scared."],
    explicit: ["A", "The passage doesn't say where she was, so you can't really know."],
    vague: ["D", "not sure"],
  },
  "q-math-frac-pizza": {
    correct: ["B", "The pizzas are the same size and fourths are bigger pieces than eighths."],
    ld: ["A", "Noah because 8 is bigger than 4 so he ate more."],
    sn: ["C", "They both ate 3 pieces so it's the same."],
    slip: ["A", "Fourths are bigger pieces than eighths so Mia ate more. I clicked the wrong one."],
    vague: ["D", "idk"],
  },
  "q-math-frac-juice": {
    correct: ["C", "Thirds are bigger pieces than fifths, so Ella poured more."],
    ld: ["A", "Sam because 5 is bigger than 3."],
    sn: ["B", "They both poured 2 parts so it is the same amount."],
    slip: ["A", "Thirds are bigger pieces than fifths so Ella. Oops I picked Sam."],
    vague: ["D", "not sure"],
  },
  "q-math-frac-granola": {
    correct: ["D", "Thirds are bigger pieces than fifths and the bars are the same size."],
    ld: ["B", "Jun because 5 is more than 3 so she has more."],
    sn: ["A", "Both ate 2 pieces so they are equal."],
    slip: ["B", "Thirds are bigger pieces than fifths so Kim, but I clicked Jun by mistake."],
    vague: ["C", "i dont know"],
  },
  "q-math-frac-paint": {
    correct: ["A", "Sixths are bigger parts than tenths, so 3/6 is more."],
    ld: ["B", "Omar because 10 is bigger than 6."],
    sn: ["C", "The top numbers are the same so they painted the same amount."],
    slip: ["B", "Sixths are bigger parts than tenths so Lila painted more, I clicked wrong."],
    vague: ["D", "guess"],
  },
};
const OTHER: Record<string, { correct: Resp; wrong: Resp }> = {
  "q-read-main-amina": { correct: ["B", "Every sentence is about Amina taking care of the seedlings."], wrong: ["C", "The window was hot."] },
  "q-read-vocab-drooping": { correct: ["C", "The soil was dry so the plants were hanging down."], wrong: ["A", "Plants grow taller."] },
  "q-read-vocab-batter": { correct: ["B", "Her dad was mixing batter to make more muffins."], wrong: ["A", "A batter hits the ball in baseball."] },
  "q-read-evidence-kofi": { correct: ["B", "Empty trays and a line show lots of people wanted them."], wrong: ["A", "They had three trays."] },
  "q-math-place-value": { correct: ["C", "The 7 is in the thousands place."], wrong: ["B", "7 is in the hundreds."] },
  "q-math-add-library": { correct: ["B", "1250 + 375 = 1625"], wrong: ["C", "I added 1250 and 375 and got 1615."] },
  "q-math-sub-theatre": { correct: ["D", "2400 - 1675 = 725, and 1675 + 725 = 2400."], wrong: ["C", "I subtracted and got 825."] },
  "q-math-div-chairs": { correct: ["D", "8 x 12 = 96 so there are 12 in each row."], wrong: ["B", "96 - 8 = 88"] },
  "q-math-mult-markers": { correct: ["C", "10 x 6 = 60 and 4 x 6 = 24, so 84."], wrong: ["B", "14 x 6 is 74"] },
};
const COMEBACK: Record<string, Resp> = {
  "q-math-frac-ribbon": ["A", "Fifths are bigger pieces than ninths so Sara used more."],
  "q-math-frac-garden": ["D", "Sixths are bigger pieces than eighths so Ravi planted more."],
  "q-read-inf-leo": ["B", "There was frost on the grass so he expected it to be cold."],
  "q-read-inf-priya": ["A", "The tomatoes were bright red and she grabbed a basket to pick them."],
};
const CLARIFY: Record<string, string> = {
  reading: "I thought that because it sounded like something that could happen.",
  math: "8 pieces is more than 4 pieces so more pizza",
};

const NAMES = [
  "Maple Fox", "River Owl", "Cedar Wren", "Sunny Hare", "Pebble Lynx", "Comet Otter", "Juniper Bee", "Quartz Heron",
  "Willow Finch", "Birch Seal", "Ember Crane", "Nova Panda", "Clover Yak", "Robin Koala", "Atlas Newt", "Hazel Moth",
];

interface Profile {
  pCorrect: number;
  reading: "unsup" | "explicit" | "vague";
  math: "ld" | "sn" | "slip" | "vague";
  notSure: boolean;
  readAloud: boolean;
  comebackSkill: number;
}
const PROFILES: Profile[] = [
  { pCorrect: 0.95, reading: "vague", math: "slip", notSure: false, readAloud: false, comebackSkill: 0.9 },
  { pCorrect: 0.35, reading: "unsup", math: "ld", notSure: false, readAloud: false, comebackSkill: 0.8 },
  { pCorrect: 0.4, reading: "explicit", math: "sn", notSure: false, readAloud: true, comebackSkill: 0.75 },
  { pCorrect: 0.85, reading: "unsup", math: "slip", notSure: false, readAloud: false, comebackSkill: 0.9 },
  { pCorrect: 0.3, reading: "vague", math: "vague", notSure: true, readAloud: true, comebackSkill: 0.5 },
  { pCorrect: 0.5, reading: "unsup", math: "ld", notSure: false, readAloud: false, comebackSkill: 0.7 },
  { pCorrect: 0.7, reading: "explicit", math: "sn", notSure: false, readAloud: false, comebackSkill: 0.8 },
  { pCorrect: 0.6, reading: "unsup", math: "ld", notSure: false, readAloud: true, comebackSkill: 0.6 },
];

async function simulateStudent(competitionId: string, roomCode: string, nickname: string, profile: Profile, stopAfter: number | null) {
  const { learner } = await joinCompetition(db, null, { roomCode, nickname });
  const me: Learner = learner;
  let answered = 0;
  for (let guard = 0; guard < 40; guard++) {
    const state = await getPlayState(db, me, competitionId);
    const step = state.step;
    if (step.type === "done" || step.type === "closed") break;
    if (step.type === "question") {
      if (stopAfter !== null && answered >= stopAfter) break;
      const qid = step.questionId;
      const subject = state.competition.subject;
      let resp: Resp;
      if (ADAPTIVE[qid]) {
        const kind = rand() < profile.pCorrect ? "correct" : subject === "reading" ? profile.reading : profile.math;
        resp = ADAPTIVE[qid][kind] ?? ADAPTIVE[qid].correct;
      } else {
        resp = rand() < profile.pCorrect + 0.15 ? OTHER[qid].correct : OTHER[qid].wrong;
      }
      const notSure = profile.notSure && rand() < 0.5;
      await submitInitialAnswer(db, analyzer, me, competitionId, {
        questionId: qid,
        selectedAnswer: resp[0],
        reasoning: notSure ? "" : resp[1],
        reasoningStatus: notSure ? "not_sure" : "provided",
        readAloudUsed: subject === "reading" && profile.readAloud,
      });
      answered++;
    } else if (step.type === "clarify") {
      const subject = state.competition.subject;
      await submitClarification(db, analyzer, me, competitionId, step.attemptId, rand() < 0.6 ? { text: CLARIFY[subject] } : { declined: true });
    } else if (step.type === "practice") {
      await completePractice(db, me, competitionId, step.attemptId);
    } else if (step.type === "comeback") {
      const good = COMEBACK[step.questionId];
      const correct = rand() < profile.comebackSkill;
      const choice = correct ? good[0] : SEED_QUESTIONS.find((q) => q.id === step.questionId)!.answerChoices.find((c) => c.id !== good[0])!.id;
      await submitComeback(db, analyzer, me, competitionId, step.attemptId, {
        questionId: step.questionId,
        selectedAnswer: choice,
        reasoning: correct ? good[1] : "I think it's this one.",
        reasoningStatus: "provided",
        readAloudUsed: false,
      });
    }
  }
  return me;
}

/** Flags everything a dummy student produced as synthetic and removes their session identity. */
async function markSynthetic(competitionId: string, learners: Learner[]) {
  const participants = await db.select("participants", { eq: { competitionId } });
  for (const p of participants) {
    await db.update("participants", { id: p.id }, { isSynthetic: true, nickname: `${p.nickname} (synthetic)`, learnerId: null });
    const attempts = await db.update("attempts", { participantId: p.id }, { isSynthetic: true });
    for (const a of attempts) await db.update("analyses", { attemptId: a.id }, { isSynthetic: true });
  }
  if (learners.length) await admin.from("learners").delete().in("id", learners.map((l) => l.id));
}

async function ensureHost(email: string, displayName: string, hostRole: "teacher"): Promise<Host> {
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, host_role: hostRole },
    });
    if (error) throw error;
    user = data.user!;
  } else {
    await admin.auth.admin.updateUserById(user.id, { password });
  }
  const [existing] = await db.select("hosts", { eq: { id: user.id } });
  return existing ?? db.insert("hosts", { id: user.id, displayName, hostRole, createdAt: new Date().toISOString() });
}

interface Plan {
  title: string;
  description: string;
  subject: "reading" | "math";
  questionIds: string[];
  students: number;
  partial?: number;
  final: "open" | "closed" | "draft";
}

async function runPlan(host: Host, plan: Plan, nameOffset: number) {
  const comp = await createCompetition(db, host, { title: plan.title, description: plan.description, subject: plan.subject, gradeLevel: 5, questionIds: plan.questionIds });
  await db.update("competitions", { id: comp.id }, { isDemoData: plan.students > 0 });
  if (plan.final === "draft") return { ...comp, participants: 0 };
  await setCompetitionStatus(db, host, comp.id, "open");
  const learners: Learner[] = [];
  for (let i = 0; i < plan.students; i++) {
    const name = NAMES[(nameOffset + i) % NAMES.length];
    const profile = PROFILES[(nameOffset + i) % PROFILES.length];
    const stop = plan.partial && i >= plan.students - plan.partial ? 1 + Math.floor(rand() * (plan.questionIds.length - 1)) : null;
    learners.push(await simulateStudent(comp.id, comp.roomCode, name, profile, stop));
    process.stdout.write(".");
  }
  await markSynthetic(comp.id, learners);
  if (plan.final === "closed") await setCompetitionStatus(db, host, comp.id, "closed");
  console.log(` ${plan.title}: ${plan.students} synthetic students`);
  return { ...comp, participants: plan.students };
}

async function main() {
  // 1. Make sure the verified library content (including new questions) is present.
  for (const p of SEED_PASSAGES) await admin.from("passages").upsert({ id: p.id, subject: p.subject, grade_level: p.gradeLevel, title: p.title, body: p.body, owner_id: null, source: "seed" });
  for (const r of SEED_PRACTICE)
    await admin.from("practice_resources").upsert({ id: r.id, subject: r.subject, skill: r.skill, kind: r.kind, misconception: r.misconception, title: r.title, explanation: r.explanation, worked_example: r.workedExample, verified: r.verified });
  const ordered = [...SEED_QUESTIONS].sort((a, b) => Number(a.questionRole === "initial") - Number(b.questionRole === "initial"));
  for (const q of ordered) {
    const { error } = await admin.from("questions").upsert({
      id: q.id, version: q.version, subject: q.subject, grade_level: q.gradeLevel, skill: q.skill, skill_focus: q.skillFocus, question_role: q.questionRole,
      passage_id: q.passageId, prompt: q.prompt, reasoning_prompt: q.reasoningPrompt, answer_choices: q.answerChoices, correct_answer: q.correctAnswer,
      reference_explanation: q.referenceExplanation, allowed_misconceptions: q.allowedMisconceptions, practice_resource_id: q.practiceResourceId,
      follow_up_question_id: q.followUpQuestionId, verified: q.verified, owner_id: null, source: "seed",
    });
    if (error) throw new Error(`question ${q.id}: ${error.message}`);
  }
  console.log(`Library: ${SEED_QUESTIONS.length} verified questions upserted.`);

  // 2. Demo hosts.
  const rivera = await ensureHost("rivera.demo@rematch-demo.app", "Ms. Rivera (demo teacher)", "teacher");
  const existing = await db.select("competitions", { in: { column: "ownerId", values: [rivera.id] } });
  if (existing.length) {
    if (!process.argv.includes("--reset")) throw new Error("Demo competitions already exist. Rerun with --reset to replace them.");
    await admin.from("competitions").delete().in("owner_id", [rivera.id]);
    console.log(`Removed ${existing.length} previous demo competitions.`);
  }

  // 3. Classrooms.
  const riveraPlans: Plan[] = [
    { title: "Room 5B Reading: Clue Detectives", description: "Read short passages and explain which clues helped you.", subject: "reading", questionIds: ["q-read-inf-amina", "q-read-inf-kofi", "q-read-inf-mateo", "q-read-main-amina"], students: 10, partial: 2, final: "open" },
    { title: "Room 5B Math: Fraction Face-off", description: "Compare fractions of same-sized wholes and explain your thinking.", subject: "math", questionIds: ["q-math-frac-pizza", "q-math-frac-juice", "q-math-frac-granola", "q-math-place-value"], students: 10, partial: 2, final: "open" },
    { title: "Room 5C Reading: Words & Evidence", description: "Use context clues and choose the best evidence.", subject: "reading", questionIds: ["q-read-vocab-drooping", "q-read-vocab-batter", "q-read-evidence-kofi", "q-read-inf-patel"], students: 6, partial: 1, final: "open" },
    { title: "Room 5C Math: Number Power", description: "Add, subtract, multiply, divide — and one fraction challenge.", subject: "math", questionIds: ["q-math-add-library", "q-math-sub-theatre", "q-math-mult-markers", "q-math-div-chairs", "q-math-frac-paint"], students: 6, partial: 1, final: "open" },
    { title: "Live Demo: Fraction Rematch (empty)", description: "No responses yet — join and watch the dashboard update.", subject: "math", questionIds: ["q-math-frac-pizza", "q-math-frac-paint", "q-math-place-value"], students: 0, final: "open" },
    { title: "Week 1 Warm-up: Inference", description: "Last week's sprint.", subject: "reading", questionIds: ["q-read-inf-amina", "q-read-vocab-drooping", "q-read-main-amina"], students: 8, final: "closed" },
    { title: "Next week: Inference review (draft)", description: "Draft — not launched.", subject: "reading", questionIds: ["q-read-inf-kofi", "q-read-inf-patel", "q-read-evidence-kofi"], students: 0, final: "draft" },
  ];

  const results: { host: string; title: string; code: string; status: string; participants: number }[] = [];
  let offset = 0;
  for (const p of riveraPlans) {
    const c = await runPlan(rivera, p, offset);
    offset += 3;
    results.push({ host: "Ms. Rivera", title: p.title, code: c.roomCode, status: p.final, participants: c.participants });
  }
  console.log("\nRESULTS_JSON " + JSON.stringify(results));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
