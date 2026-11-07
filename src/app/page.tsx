import { LinkButton, Card } from "@/components/ui";

const LOOP = [
  { step: "Attempt", text: "Answer a short question at your own pace." },
  { step: "Explain", text: "Say which clues or ideas helped you decide." },
  { step: "Diagnose", text: "Rematch looks for a likely idea behind the answer." },
  { step: "Practise", text: "A short worked example targets that idea." },
  { step: "Rematch", text: "Try a fresh question and earn comeback points." },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="grid gap-8 md:grid-cols-[1.2fr_1fr] items-center pt-2">
        <div className="space-y-5">
          <p className="inline-flex rounded-full bg-violet-soft text-violet-strong text-sm font-semibold px-3 py-1">
            Reading comprehension · Math · Grade 5 demo
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Every wrong answer is a <span className="text-violet">rematch</span> waiting to happen.
          </h1>
          <p className="text-lg text-navy-soft max-w-prose">
            Short learning sprints where students explain their thinking, get practice that fits, and come back stronger. No
            timers, no public leaderboards.
          </p>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/join" className="text-lg px-6 py-3">
              Join with a code
            </LinkButton>
            <LinkButton href="/host" variant="secondary" className="text-lg px-6 py-3">
              Host a competition
            </LinkButton>
          </div>
          <p className="text-sm text-navy-soft">Teachers host sprints and see results only for the sprints they create.</p>
        </div>
        <Card className="bg-gradient-to-br from-white to-violet-soft/60">
          <h2 className="font-bold text-lg mb-3">The learning loop</h2>
          <ol className="space-y-3">
            {LOOP.map((l, i) => (
              <li key={l.step} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet text-white font-bold text-sm" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <strong>{l.step}.</strong> <span className="text-navy-soft">{l.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="What makes Rematch different">
        <Card>
          <h2 className="font-bold">Scored fairly</h2>
          <p className="text-sm text-navy-soft mt-1">
            100 points for a correct first try, 50 comeback points after practice. Scores come from answer keys — never from AI.
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">Evidence, not labels</h2>
          <p className="text-sm text-navy-soft mt-1">
            Likely misconceptions are shown only with a quote from the student&apos;s own explanation. Teachers can override.
          </p>
        </Card>
        <Card>
          <h2 className="font-bold">Private progress</h2>
          <p className="text-sm text-navy-soft mt-1">Students see their own growth. There is no public ranking.</p>
        </Card>
      </section>
    </div>
  );
}
