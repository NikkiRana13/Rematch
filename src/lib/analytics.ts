import { isSpecificCategory } from "./content/taxonomy";
import type {
  Analysis,
  Attempt,
  Category,
  ClassificationOverride,
  Competition,
  Participant,
  Question,
  SkillId,
  Subject,
} from "./types";

/** MVP display rule (not a validated educational threshold). */
export const LIMITED_EVIDENCE_THRESHOLD = 3;

export interface Ratio {
  numerator: number;
  denominator: number;
  /** null when the denominator is 0. */
  rate: number | null;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, rate: denominator === 0 ? null : numerator / denominator };
}

export interface EffectiveClassification {
  attemptId: string;
  analysisId: string | null;
  category: Category | null;
  evidenceQuote: string | null;
  source: "ai" | "rule-based" | "host-override" | "synthetic" | "unavailable";
  provider: string | null;
  overridden: boolean;
  originalCategory: Category | null;
}

/** Latest analysis per attempt (clarification stage wins over initial). */
export function latestAnalysisByAttempt(analyses: Analysis[]): Map<string, Analysis> {
  const m = new Map<string, Analysis>();
  for (const a of analyses) {
    const prev = m.get(a.attemptId);
    if (!prev || stageRank(a) > stageRank(prev) || (stageRank(a) === stageRank(prev) && a.createdAt > prev.createdAt)) {
      m.set(a.attemptId, a);
    }
  }
  return m;
}
function stageRank(a: Analysis) {
  return a.stage === "clarification" ? 1 : 0;
}

/** Host overrides take precedence but never delete the original analysis. */
export function effectiveClassification(
  attemptId: string,
  latest: Analysis | undefined,
  overrides: ClassificationOverride[],
): EffectiveClassification {
  const ov = overrides
    .filter((o) => o.attemptId === attemptId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const originalCategory = latest?.status === "completed" ? latest.category : null;
  if (ov) {
    return {
      attemptId,
      analysisId: latest?.id ?? null,
      category: ov.category,
      evidenceQuote: latest?.evidenceQuote ?? null,
      source: "host-override",
      provider: latest?.provider ?? null,
      overridden: true,
      originalCategory,
    };
  }
  if (!latest || latest.status !== "completed") {
    return {
      attemptId,
      analysisId: latest?.id ?? null,
      category: null,
      evidenceQuote: null,
      source: "unavailable",
      provider: latest?.provider ?? null,
      overridden: false,
      originalCategory: null,
    };
  }
  return {
    attemptId,
    analysisId: latest.id,
    category: latest.category,
    evidenceQuote: latest.evidenceQuote,
    source: latest.isSynthetic ? "synthetic" : latest.provider === "anthropic" ? "ai" : "rule-based",
    provider: latest.provider,
    overridden: false,
    originalCategory,
  };
}

export interface SkillAccuracy {
  skill: SkillId;
  subject: Subject;
  accuracy: Ratio;
  distinctQuestions: number;
  limitedEvidence: boolean;
}

export interface MisconceptionCount {
  category: Category;
  /** Distinct participants with a supporting classification for this category. */
  participants: Ratio;
  evidence: { attemptId: string; participantNickname: string; quote: string | null; source: EffectiveClassification["source"] }[];
}

export interface ReviewCase {
  attemptId: string;
  participantNickname: string;
  questionId: string;
  kind: "clarification" | "teacher_review" | "analysis_unavailable";
  reason: string;
  reasoning: string;
  clarificationText: string | null;
  category: Category | null;
}

export interface CompetitionAnalytics {
  participantCount: number;
  completion: Ratio;
  skillAccuracy: SkillAccuracy[];
  questionAccuracy: { questionId: string; accuracy: Ratio }[];
  comebackSuccess: Ratio;
  comebackPoints: number;
  initialPoints: number;
  misconceptions: MisconceptionCount[];
  reviewCases: ReviewCase[];
  readAloud: { used: Ratio; accuracyWith: Ratio; accuracyWithout: Ratio } | null;
  analysisSources: Record<string, number>;
  unavailableAnalyses: number;
  includesSyntheticData: boolean;
}

/**
 * Analytics for one competition, or aggregated across several (`competitions`).
 * Completion and first-attempt filters are applied per competition.
 */
export function computeCompetitionAnalytics(input: {
  competition?: Competition;
  competitions?: Competition[];
  questions: Question[];
  participants: Participant[];
  attempts: Attempt[];
  analyses: Analysis[];
  overrides: ClassificationOverride[];
}): CompetitionAnalytics {
  const { participants, attempts, analyses, overrides } = input;
  const comps = input.competitions ?? (input.competition ? [input.competition] : []);
  const compById = new Map(comps.map((c) => [c.id, c]));
  const nick = new Map(participants.map((p) => [p.id, p.nickname]));
  const initial = attempts.filter((a) => a.kind === "initial" && Boolean(compById.get(a.competitionId)?.questionIds.includes(a.questionId)));
  const comeback = attempts.filter((a) => a.kind === "comeback");

  const completed = participants.filter((p) => {
    const c = compById.get(p.competitionId);
    return Boolean(c) && c!.questionIds.every((qid) => initial.some((a) => a.participantId === p.id && a.questionId === qid));
  }).length;

  // Skill accuracy: first attempts only (comebacks excluded so baseline is not inflated).
  const bySkill = new Map<SkillId, Attempt[]>();
  for (const a of initial) bySkill.set(a.skill, [...(bySkill.get(a.skill) ?? []), a]);
  const skillAccuracy: SkillAccuracy[] = [...bySkill.entries()].map(([skill, list]) => {
    const distinctQuestions = new Set(list.map((a) => a.questionId)).size;
    return {
      skill,
      subject: list[0].subject,
      accuracy: ratio(list.filter((a) => a.isCorrect).length, list.length),
      distinctQuestions,
      limitedEvidence: distinctQuestions < LIMITED_EVIDENCE_THRESHOLD,
    };
  });

  const questionAccuracy = [...new Set(comps.flatMap((c) => c.questionIds))].map((qid) => {
    const list = initial.filter((a) => a.questionId === qid);
    return { questionId: qid, accuracy: ratio(list.filter((a) => a.isCorrect).length, list.length) };
  });

  const latest = latestAnalysisByAttempt(analyses);
  const analysedParticipants = new Set<string>();
  const byCategory = new Map<Category, MisconceptionCount["evidence"]>();
  const participantsByCategory = new Map<Category, Set<string>>();
  const analysisSources: Record<string, number> = {};
  let unavailableAnalyses = 0;

  for (const a of initial) {
    const la = latest.get(a.id);
    if (la) {
      const key = la.isSynthetic ? "demo data" : la.provider;
      analysisSources[key] = (analysisSources[key] ?? 0) + 1;
      if (la.status === "unavailable") unavailableAnalyses++;
    }
    const eff = effectiveClassification(a.id, la, overrides);
    if (eff.category) analysedParticipants.add(a.participantId);
    // Supporting classification: a specific category with a validated excerpt, or a host override.
    if (eff.category && isSpecificCategory(eff.category) && (eff.evidenceQuote || eff.overridden)) {
      byCategory.set(eff.category, [
        ...(byCategory.get(eff.category) ?? []),
        {
          attemptId: a.id,
          participantNickname: nick.get(a.participantId) ?? "Participant",
          quote: eff.evidenceQuote,
          source: eff.source,
        },
      ]);
      participantsByCategory.set(eff.category, (participantsByCategory.get(eff.category) ?? new Set()).add(a.participantId));
    }
  }

  const misconceptions: MisconceptionCount[] = [...byCategory.entries()]
    .map(([category, evidence]) => ({
      category,
      participants: ratio(participantsByCategory.get(category)?.size ?? 0, analysedParticipants.size),
      evidence,
    }))
    .sort((a, b) => b.participants.numerator - a.participants.numerator);

  const reviewCases: ReviewCase[] = [];
  for (const a of initial) {
    const la = latest.get(a.id);
    const base = {
      attemptId: a.id,
      participantNickname: nick.get(a.participantId) ?? "Participant",
      questionId: a.questionId,
      reasoning: a.reasoning,
      clarificationText: a.clarificationText,
      category: la?.status === "completed" ? la.category : null,
    };
    if (a.clarificationStatus !== "none") {
      reviewCases.push({ ...base, kind: "clarification", reason: `Clarification ${a.clarificationStatus}` });
    } else if (la?.status === "unavailable") {
      reviewCases.push({ ...base, kind: "analysis_unavailable", reason: "Analysis unavailable" });
    } else if (a.teacherReview) {
      reviewCases.push({ ...base, kind: "teacher_review", reason: a.route?.reason ?? "Flagged for review" });
    }
  }

  let readAloud: CompetitionAnalytics["readAloud"] = null;
  if (comps.some((c) => c.subject === "reading") || initial.some((a) => a.subject === "reading")) {
    const reading = initial.filter((a) => a.subject === "reading");
    const withRA = reading.filter((a) => a.readAloudUsed);
    const without = reading.filter((a) => !a.readAloudUsed);
    readAloud = {
      used: ratio(withRA.length, reading.length),
      accuracyWith: ratio(withRA.filter((a) => a.isCorrect).length, withRA.length),
      accuracyWithout: ratio(without.filter((a) => a.isCorrect).length, without.length),
    };
  }

  return {
    participantCount: participants.length,
    completion: ratio(completed, participants.length),
    skillAccuracy,
    questionAccuracy,
    comebackSuccess: ratio(comeback.filter((a) => a.isCorrect).length, comeback.length),
    comebackPoints: comeback.reduce((s, a) => s + a.points, 0),
    initialPoints: initial.reduce((s, a) => s + a.points, 0),
    misconceptions,
    reviewCases,
    readAloud,
    analysisSources,
    unavailableAnalyses,
    includesSyntheticData: participants.some((p) => p.isSynthetic),
  };
}

export interface LearnerSkillProgress {
  skill: SkillId;
  subject: Subject;
  accuracy: Ratio;
  distinctQuestions: number;
  limitedEvidence: boolean;
  comebacks: Ratio;
}

/**
 * Per-learner progress: most recent first attempt per distinct question (up to `recent`
 * questions per skill). Comeback results are reported separately.
 */
export function learnerProgress(attempts: Attempt[], recent = 10): LearnerSkillProgress[] {
  const initial = attempts.filter((a) => a.kind === "initial").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const skills = new Map<SkillId, Attempt[]>();
  for (const a of initial) {
    const list = skills.get(a.skill) ?? [];
    if (!list.some((x) => x.questionId === a.questionId) && list.length < recent) list.push(a);
    skills.set(a.skill, list);
  }
  return [...skills.entries()].map(([skill, list]) => {
    const cb = attempts.filter((a) => a.kind === "comeback" && a.skill === skill);
    return {
      skill,
      subject: list[0].subject,
      accuracy: ratio(list.filter((a) => a.isCorrect).length, list.length),
      distinctQuestions: list.length,
      limitedEvidence: list.length < LIMITED_EVIDENCE_THRESHOLD,
      comebacks: ratio(cb.filter((a) => a.isCorrect).length, cb.length),
    };
  });
}

export function formatRatio(r: Ratio): string {
  if (r.rate === null) return `— (0 of 0)`;
  return `${Math.round(r.rate * 100)}% (${r.numerator} of ${r.denominator})`;
}
