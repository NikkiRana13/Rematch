"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { HostGate } from "@/components/HostGate";
import { api } from "@/components/fetcher";
import { Alert, Badge, Button, Card, EmptyState, Spinner, SubjectBadge } from "@/components/ui";

interface Ratio {
  numerator: number;
  denominator: number;
  rate: number | null;
}
interface Overview {
  available: { id: string; title: string; subject: "reading" | "math"; status: string; isDemoData: boolean }[];
  selectedIds: string[];
  analytics: {
    participantCount: number;
    completion: Ratio;
    comebackSuccess: Ratio;
    initialPoints: number;
    comebackPoints: number;
    skillAccuracy: { skill: string; accuracy: Ratio; distinctQuestions: number; limitedEvidence: boolean }[];
    misconceptions: { category: string; participants: Ratio; evidence: { attemptId: string; participantNickname: string; quote: string | null }[] }[];
    reviewCases: unknown[];
    includesSyntheticData: boolean;
  };
  perCompetition: { id: string; title: string; subject: "reading" | "math"; status: string; isDemoData: boolean; participants: number; completion: Ratio; firstTryAccuracy: { numerator: number; denominator: number }; comebackSuccess: Ratio }[];
}

const SKILL: Record<string, string> = {
  "reading.main_idea": "Main idea",
  "reading.inference": "Inference",
  "reading.vocabulary_in_context": "Vocabulary in context",
  "reading.supporting_evidence": "Supporting evidence",
  "math.place_value": "Place value",
  "math.addition_subtraction": "Addition and subtraction",
  "math.multiplication_division": "Multiplication and division",
  "math.fractions_intro": "Introductory fractions",
};
const CAT: Record<string, string> = {
  UNSUPPORTED_INFERENCE: "Unsupported inference",
  EXPLICIT_STATEMENT_REQUIRED: "Expects the answer to be stated directly",
  LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT: "Larger denominator means larger amount",
  SAME_NUMERATOR_MEANS_EQUAL_AMOUNT: "Same numerator means equal amount",
  SLIP_WITH_CORRECT_METHOD: "Slip with correct method",
  OTHER_MISCONCEPTION: "Other misconception",
};
const pct = (r: { numerator: number; denominator: number }) => (r.denominator ? `${Math.round((100 * r.numerator) / r.denominator)}%` : "—");
const frac = (r: { numerator: number; denominator: number }) => `${r.numerator} of ${r.denominator}`;

export default function OverviewPage() {
  return <HostGate>{() => <OverviewInner />}</HostGate>;
}

function OverviewInner() {
  const [subject, setSubject] = useState<"all" | "reading" | "math">("all");
  const [ids, setIds] = useState<string[] | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ subject });
      if (ids) q.set("ids", ids.join(","));
      setData(await api<Overview>(`/api/host/overview?${q}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [subject, ids]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const a = data?.analytics;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/host" className="text-sm underline">
          ← Host dashboard
        </Link>
        <h1 className="text-3xl font-bold">Class overview</h1>
        <p className="text-navy-soft">Combined results across your competitions. Choose a subject and which competitions to include.</p>
      </div>

      <Card className="space-y-4">
        <div role="group" aria-label="Subject" className="flex flex-wrap gap-2">
          {(["all", "reading", "math"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={subject === s}
              onClick={() => {
                setSubject(s);
                setIds(null);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${subject === s ? "bg-violet-soft border-2 border-violet text-navy" : "bg-white border-line hover:border-violet"}`}
            >
              {s === "all" ? "All subjects" : s === "reading" ? "Reading" : "Math"}
            </button>
          ))}
        </div>
        {data && (
          <fieldset>
            <legend className="text-sm font-semibold mb-2">
              Competitions ({data.selectedIds.length} of {data.available.length} selected)
            </legend>
            <div className="flex flex-wrap gap-2 mb-2">
              <Button variant="ghost" className="py-1 text-sm" onClick={() => setIds(null)}>
                Select all
              </Button>
              <Button variant="ghost" className="py-1 text-sm" onClick={() => setIds([])}>
                Clear
              </Button>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {data.available.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-violet"
                      checked={data.selectedIds.includes(c.id)}
                      onChange={(e) => {
                        const cur = data.selectedIds;
                        setIds(e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id));
                      }}
                    />
                    {c.title} {c.isDemoData && <Badge tone="amber">Demo</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </Card>

      {error && <Alert tone="rose" role="alert">{error}</Alert>}
      {!data || !a ? (
        <Spinner label="Combining results" />
      ) : data.selectedIds.length === 0 ? (
        <EmptyState title="No competitions selected">Choose at least one competition above.</EmptyState>
      ) : (
        <>
          {a.includesSyntheticData && <Alert tone="amber" title="Includes demonstration data">Some selected competitions contain fictional participants.</Alert>}
          <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Participant entries" value={String(a.participantCount)} hint="Counted per competition joined" />
            <Tile label="Completed their sprint" value={pct(a.completion)} hint={frac(a.completion)} />
            <Tile label="Comeback success" value={pct(a.comebackSuccess)} hint={frac(a.comebackSuccess)} />
            <Tile label="Points awarded" value={`${a.initialPoints} first-try`} hint={`${a.comebackPoints} comeback`} />
          </section>
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Card>
              <h2 className="text-xl font-bold">Skill accuracy (first attempts)</h2>
              <p className="text-xs text-navy-soft mb-3">Correct first attempts / all first attempts across selected competitions. Not a mastery score.</p>
              <ul className="space-y-3">
                {a.skillAccuracy.map((s) => (
                  <li key={s.skill}>
                    <div className="flex justify-between text-sm gap-2">
                      <span className="font-semibold">{SKILL[s.skill] ?? s.skill}</span>
                      <span>
                        <strong>{pct(s.accuracy)}</strong> ({frac(s.accuracy)})
                      </span>
                    </div>
                    <div className="h-3 rounded bg-cream-2 mt-1" role="img" aria-label={`${SKILL[s.skill]}: ${frac(s.accuracy)} correct`}>
                      <div className="h-full rounded-r bg-violet" style={{ width: `${Math.round((s.accuracy.rate ?? 0) * 100)}%` }} />
                    </div>
                    {s.limitedEvidence && <p className="text-xs text-amber mt-1">⚠ Limited evidence: {s.distinctQuestions} distinct question(s)</p>}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="text-xl font-bold">Likely misconceptions</h2>
              <p className="text-xs text-navy-soft mb-3">Participant entries with a quote-supported classification. Likely explanations, not diagnoses.</p>
              {a.misconceptions.length === 0 ? (
                <p className="text-sm text-navy-soft">None found.</p>
              ) : (
                <ul className="space-y-3">
                  {a.misconceptions.map((m) => (
                    <li key={m.category}>
                      <div className="flex justify-between text-sm gap-2">
                        <span className="font-semibold">{CAT[m.category] ?? m.category}</span>
                        <span>{frac(m.participants)}</span>
                      </div>
                      {m.evidence[0]?.quote && <p className="text-sm italic text-navy-soft">“{m.evidence[0].quote}” — {m.evidence[0].participantNickname}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card className="overflow-x-auto">
            <h2 className="text-xl font-bold mb-3">By competition</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-navy-soft">
                  <th scope="col" className="p-2">Competition</th>
                  <th scope="col" className="p-2">Participants</th>
                  <th scope="col" className="p-2">Completed</th>
                  <th scope="col" className="p-2">First-try accuracy</th>
                  <th scope="col" className="p-2">Comebacks</th>
                  <th scope="col" className="p-2"><span className="sr-only">Link</span></th>
                </tr>
              </thead>
              <tbody>
                {data.perCompetition.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <th scope="row" className="p-2 text-left font-semibold">
                      <span className="flex flex-wrap items-center gap-2">
                        <SubjectBadge subject={c.subject} /> {c.title}
                      </span>
                    </th>
                    <td className="p-2">{c.participants}</td>
                    <td className="p-2">
                      {pct(c.completion)} ({frac(c.completion)})
                    </td>
                    <td className="p-2">
                      {pct(c.firstTryAccuracy)} ({frac(c.firstTryAccuracy)})
                    </td>
                    <td className="p-2">
                      {pct(c.comebackSuccess)} ({frac(c.comebackSuccess)})
                    </td>
                    <td className="p-2">
                      <Link className="underline text-violet-strong" href={`/host/competitions/${c.id}`}>
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-sm text-navy-soft font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-sm">{hint}</p>
    </div>
  );
}
