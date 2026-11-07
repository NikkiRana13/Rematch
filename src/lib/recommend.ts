import { skillInfo } from "./content/taxonomy";
import type { Attempt, Question, SkillId, Subject } from "./types";

export interface SprintRecommendation {
  questionIds: string[];
  focusSkills: SkillId[];
  reviewSkills: SkillId[];
  rationale: string[];
}

export const RECOMMEND_RULES = {
  recentWindow: 30,
  weakMinErrors: 2,
  weakMaxAccuracy: 0.7,
  maxPerFocusSkill: 2,
  maxFocusSkills: 2,
  targetLength: 4,
};

/**
 * Explicit rules (not a trained model):
 * 1. Look at the most recent first attempts (comebacks excluded).
 * 2. A skill is a focus when it has ≥2 recent errors and accuracy < 70%.
 * 3. At most 2 questions per focus skill (avoid endlessly repeating one weak skill),
 *    preferring questions the class has not recently attempted.
 * 4. Fill remaining slots with review of other skills that have verified questions.
 */
export function recommendNextSprint(subject: Subject, history: Attempt[], bank: Question[]): SprintRecommendation {
  const R = RECOMMEND_RULES;
  const eligible = bank.filter((q) => q.subject === subject && q.verified && q.questionRole === "initial");
  const recent = history
    .filter((a) => a.kind === "initial" && a.subject === subject)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, R.recentWindow);
  const recentQuestionIds = new Set(recent.map((a) => a.questionId));

  const stats = new Map<SkillId, { errors: number; total: number }>();
  for (const a of recent) {
    const s = stats.get(a.skill) ?? { errors: 0, total: 0 };
    s.total++;
    if (!a.isCorrect) s.errors++;
    stats.set(a.skill, s);
  }
  const focusSkills = [...stats.entries()]
    .filter(([, s]) => s.errors >= R.weakMinErrors && s.errors / s.total > 1 - R.weakMaxAccuracy)
    .sort((a, b) => b[1].errors - a[1].errors)
    .slice(0, R.maxFocusSkills)
    .map(([k]) => k);

  const byFreshness = (a: Question, b: Question) =>
    Number(recentQuestionIds.has(a.id)) - Number(recentQuestionIds.has(b.id)) || a.id.localeCompare(b.id);

  const chosen: Question[] = [];
  const rationale: string[] = [];
  for (const skill of focusSkills) {
    const s = stats.get(skill)!;
    const picks = eligible.filter((q) => q.skill === skill).sort(byFreshness).slice(0, R.maxPerFocusSkill);
    chosen.push(...picks);
    rationale.push(
      `${skillInfo(skill).label}: ${s.errors} incorrect of ${s.total} recent first attempts → up to ${R.maxPerFocusSkill} focus questions.`,
    );
  }

  const reviewSkills: SkillId[] = [];
  const others = eligible
    .filter((q) => !focusSkills.includes(q.skill) && !chosen.includes(q))
    .sort(byFreshness);
  for (const q of others) {
    if (chosen.length >= R.targetLength) break;
    if (reviewSkills.includes(q.skill)) continue;
    chosen.push(q);
    reviewSkills.push(q.skill);
  }
  // If still short (few skills available), top up with any remaining eligible questions.
  for (const q of eligible.sort(byFreshness)) {
    if (chosen.length >= R.targetLength) break;
    if (!chosen.includes(q)) chosen.push(q);
  }
  if (reviewSkills.length) rationale.push(`Review: ${reviewSkills.map((k) => skillInfo(k).label).join(", ")} (other skills with verified questions).`);
  if (!focusSkills.length) rationale.push("No skill met the repeated-error rule; suggesting a balanced review.");

  return { questionIds: chosen.map((q) => q.id), focusSkills, reviewSkills, rationale };
}
