import Link from "next/link";

const LOOP = ["Attempt", "Explain", "Diagnose", "Practise", "Rematch"];

/** Start page: choose your side. Students and teachers each get their own pages and navigation. */
export default function Home() {
  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <div className="space-y-3 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-balance">
          Every wrong answer is a <span className="text-violet-strong">rematch</span> waiting to happen.
        </h1>
        <p className="text-lg text-navy-soft">Who&apos;s using Rematch today?</p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section aria-labelledby="student-h" className="rounded-3xl border-[3px] border-navy bg-surface p-6 sm:p-8 shadow-[6px_6px_0_#595aaf] flex flex-col gap-4">
          <p aria-hidden="true" className="text-4xl">🎮</p>
          <h2 id="student-h" className="pixel-font text-lg leading-relaxed text-violet-strong">
            I&apos;m a student
          </h2>
          <p className="text-navy-soft">Join a sprint with your class code, explain your thinking, practise, and win comeback points. No timers, no public rankings.</p>
          <div className="mt-auto flex flex-wrap gap-3">
            <Link href="/join" className="inline-flex items-center justify-center rounded-xl bg-white border-2 border-violet text-navy hover:bg-violet-soft px-5 py-3 font-semibold">
              Join with a code
            </Link>
            <Link href="/me" className="inline-flex items-center justify-center rounded-xl border border-navy bg-white px-5 py-3 font-semibold">
              My sprints
            </Link>
          </div>
        </section>

        <section aria-labelledby="teacher-h" className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-[0_2px_0_rgba(28,29,99,0.08)] flex flex-col gap-4">
          <p aria-hidden="true" className="text-4xl">🍎</p>
          <h2 id="teacher-h" className="text-2xl font-bold">
            I&apos;m a teacher
          </h2>
          <p className="text-navy-soft">Host sprints, build learning plans, and see evidence-backed results for your class. You only see the classes you create.</p>
          <div className="mt-auto flex flex-wrap gap-3">
            <Link href="/host" className="inline-flex items-center justify-center rounded-xl bg-white border-2 border-violet text-navy hover:bg-violet-soft px-5 py-3 font-semibold">
              Teacher dashboard
            </Link>
          </div>
        </section>
      </div>

      <ol aria-label="The learning loop" className="flex flex-wrap justify-center gap-2 text-sm">
        {LOOP.map((step, i) => (
          <li key={step} className="inline-flex items-center gap-2 rounded-full bg-violet-soft px-3 py-1.5 font-semibold text-violet-strong">
            <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-violet text-xs">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
