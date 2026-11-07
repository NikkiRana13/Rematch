# Rematch

**Classroom learning sprints where every wrong answer is a rematch waiting to happen.**

Rematch turns short classroom competitions in **reading comprehension** and **math** into a learning loop:

> **Attempt → Explain → Diagnose → Practise → Rematch**

Students answer a question and explain their thinking. Rematch identifies a *likely* misconception, always backed by a quote from the student's own words. It then gives them a targeted worked example and a fresh comeback question. Teachers get a live dashboard showing what the class understands, with evidence and suggested activities that they review before assigning.

🔗 **Live demo: https://rematch-phi.vercel.app**

> Grade 5 demonstration content. Ontario curriculum alignment has **not** been verified. All demo students are fictional and labelled "(synthetic)".

---

## Try it

Go to **[/join](https://rematch-phi.vercel.app/join)** and enter one of these room codes with any nickname:

| Room code | Classroom | |
|---|---|---|
| **JJVNCC** | Live Demo: Fraction Rematch | Empty, so your answers are the only data |
| **KAJ9P4** | Room 5B Reading: Clue Detectives | 10 demo students |
| **EY54Y9** | Room 5B Math: Fraction Face-off | 10 demo students |
| **S2TVM9** | Room 5C Reading: Words & Evidence | 6 demo students |
| **FDNSSV** | Room 5C Math: Number Power | 6 demo students |

**To see the full loop**, join **JJVNCC** and answer the pizza question with **Noah**, explaining *"8 is bigger than 4 so he has more."* You'll get a worked example with fraction bars, then a comeback question worth 50 points.

**To host**, go to **[/host](https://rematch-phi.vercel.app/host)** and create a teacher account. Hosting is for teachers only, and you only ever see results for competitions you create. Use **Load labelled demo data** to fill your account with example classes.

---

## How it works

**For students**
- Join with a room code and a nickname. There are no timers, speed bonuses, or public leaderboards.
- Answer, then explain your reasoning. "I'm not sure" is always allowed.
- Wrong answers lead to practice that fits your thinking, then a comeback question.
- **Scoring:** 100 points for a correct first try, 50 comeback points after practice. They're shown separately.
- **Your progress page:** reading and math progress are tracked separately and are private to you and your host.

**For teachers**
- **Building sprints:** pick from a verified question bank or write your own. Questions can't launch until the answer key is verified.
- **Live results** (updates every 5 seconds):
  - completion, skill accuracy, and comeback success, always shown as *n of N*
  - likely misconceptions, with the student quotes behind them
  - a review queue for unclear reasoning and clarification answers
  - read-aloud usage, shown as context for reading results
- **Overrides:** any classification can be overridden, and the original is kept.
- **Insights:** a teacher insight plus suggested activities from a curated library. Nothing is assigned until you review it.
- **Next sprint:** a suggested next sprint built from explicit rules: focus on repeated errors, cap repetition, and include review of other skills.

**Subjects and skills**

| Subject | Fully adaptive (targeted practice + comeback) | Also available (no adaptive support yet) |
|---|---|---|
| Reading | Making inferences using textual evidence | Main idea, vocabulary in context, supporting evidence |
| Math | Comparing fractions with the same numerator | Place value, addition & subtraction, multiplication & division |

The bank has **21 verified questions**. Every answer key is checked by an automated test.

---

## Learning plans & My Learning Roadmap

Teachers publish a learning plan organised by **lecture or lesson** (configurable label): *"By Lecture 5, students should be able to…"*. Students see where they are on it, based on their real Rematch answers.

**Teachers** (Host → Learning plans):
- **Building plans:** create plans manually, or import a `.txt`/`.md` file (max 100 KB). AI extracts a draft (rule-based parsing if AI is off). Every extracted lecture and objective must quote your file, otherwise the AI output is rejected. Vague or broad objectives (e.g. "Understand fractions") are flagged and must be resolved before publishing. PDF import isn't supported yet.
- **Linking evidence:** order lectures and objectives, then map each objective to specific verified questions. Only mapped questions ever count as evidence.
- **Publishing:** preview as a student, publish, and assign to your classrooms (competitions).
- **Versioned edits:** editing a published plan starts a revision. Students keep seeing the published version until you publish again. Objective keys are stable, and old attempts only count where the new version still maps that question.
- **Class progress:** a learner × objective grid, per-learner evidence, and overrides. Overrides require a reason, keep the computed status, and never touch the evidence.
- **Rule:** adjust the "Demonstrated in Rematch" rule within a small set of options (Standard, Lighter, or Stricter).

**Students** (My roadmap):
- **Overview:** a plan selector, overall progress (*"3 of 5 objectives demonstrated in Rematch"*), and lecture cards with objective-level status, counts and dates.
- **Next step and evidence:** a rule-based *Your next step*, recent activity (sprint vs comeback vs rematch), and an evidence view explaining each status.
- **Rematch this objective:** picks a verified question mapped to that objective, preferring ones you haven't seen. It runs through the normal practice/clarification/comeback engine, never awards competition points, and updates the roadmap immediately. If nothing is mapped: *"Your teacher hasn't added practice for this objective yet."*
- **Explain my progress:** "Am I ready for Lecture N?", "What should I practise next?", "Why does this objective need practice?". The AI only explains server-computed statuses. Every objective, attempt and practice ID it returns is validated, "mastery" claims are rejected, and treating missing data as weakness is rejected. If AI fails, a labelled rule-based summary is shown and the dashboard keeps working.
- **Resume code:** a private code to continue on another device (hash stored only).

**Demonstrated in Rematch (MVP rule, not an educational standard or grade).** Default:
- at least 3 different mapped questions answered independently
- at least 2 correct among the most recent 3
- the most recent one correct
- at least one correct rematch or comeback question

Other rules:
- Each question counts once. A question already seen (answer revealed) is practice, not evidence.
- No evidence → *Not assessed*. Some evidence → *In progress*. Enough evidence but below the rule → *Needs practice*.
- A later independent error can move an objective back to *Needs practice*.
- A lecture is demonstrated only when all its required objectives are.

**Privacy:**
- Evidence only comes from the plan owner's own competitions.
- Students see only plans assigned to classrooms they joined, and only their own progress.
- Teachers see only learners in their assigned classrooms.

## Class overview (teacher)

Host → **Class overview** combines results across competitions, with a **subject filter** (All / Reading / Math) and **competition checkboxes**. It shows completion, skill accuracy, comeback success and likely misconceptions with denominators, plus a per-competition breakdown.

---

## The AI, and its guardrails

Explanations are analysed by Claude (`claude-opus-5-5` by default) when `ANTHROPIC_API_KEY` is set. Otherwise a transparent rule-based analyser is used. The UI always labels which one produced a result.

- **AI never changes scores.** Correctness is decided by ordinary server code before any analysis runs.
- **Evidence or nothing.** A specific misconception must include a quote that actually appears in the student's text, and the server verifies it. Wrong answers alone never count as evidence.
- **Unclear reasoning gets one clarification question,** never a forced diagnosis.
- **Failures are visible.** Invalid output or API errors are stored as "analysis unavailable" and never replaced with made-up results.
- **Student text is treated as data**, so instructions embedded in an answer are ignored. The test fixtures include injection attempts.
- **Teacher insights can't invent statistics.** AI text that cites a percentage the app didn't compute is rejected, and the page falls back to labelled rule-based suggestions.
- **Separate rubrics.** Reading and math have separate taxonomies:

| Subject | Categories |
|---|---|
| Reading | `UNSUPPORTED_INFERENCE`, `EXPLICIT_STATEMENT_REQUIRED` |
| Math | `LARGER_DENOMINATOR_MEANS_LARGER_AMOUNT`, `SAME_NUMERATOR_MEANS_EQUAL_AMOUNT` |
| Shared | slip, other misconception, insufficient evidence, no misconception |

---

## Privacy and accessibility

- **Hosts** sign in with Supabase Auth and can only access competitions they own. Hosting gives no access to anyone else's records.
- **Students** get a server-issued session token in an httpOnly cookie, and only its hash is stored. A nickname or room code is never treated as authorization.
- **Answer keys** and hidden follow-up questions are never sent to students.
- **Database:** all privileged operations run server-side, and row-level security is enabled on every table.
- **Accessibility:**
  - keyboard navigation with visible focus, plus semantic, labelled forms
  - adjustable text size and line spacing
  - optional read-aloud (browser speech) with a fallback
  - reduced-motion support

These comfort settings don't diagnose or treat anything.

---

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, RLS) · Anthropic TypeScript SDK · Zod · Vitest · Vercel

---

## Run it locally

```bash
npm install
npm run dev     # http://localhost:3000
```

With no environment variables set, Rematch runs in **local demo mode**:

- Fictional data is stored in `.data/` on your machine.
- Two built-in demo host accounts are available.
- Analysis is rule-based.

It's clearly labelled, it isn't a shared database, and it's disabled automatically whenever Supabase is configured.

## Deploy your own (Supabase + Vercel)

1. **Create a Supabase project** and link it:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-ref>
   ```
2. **Apply the schema, security policies, and question bank:**
   ```bash
   npx supabase db push --remote --include-seed
   npx supabase config push --remote   # auth settings in supabase/config.toml; update site_url first
   ```
3. **Environment variables.** Copy `.env.example` to `.env.local`, then set these locally and in Vercel:

   | Variable | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Server only |
   | `ANTHROPIC_API_KEY` | **Secret.** Optional; enables AI analysis |
   | `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT` | Optional overrides |
4. **Deploy:** `npx vercel deploy --prod`, or connect the GitHub repo in Vercel for automatic deploys on every push.
5. **Learning plans migration:** `supabase/migrations/20261108000000_learning_plans.sql` is applied by the same `npx supabase db push --remote --include-seed`. It's additive: existing rows keep their data.
6. **Optional: demo classrooms.** Set `REMATCH_DEMO_HOST_PASSWORD` in `.env.local` and run:
   ```bash
   set -a; . ./.env.local; set +a
   npm run populate:demo            # add -- --reset to rebuild
   ```
   This creates a demo teacher login and 7 competitions. Fictional students are driven through the real scoring, analysis, practice and comeback services, then labelled "(synthetic)".
   Then run `npm run populate:plans` to add two fictional learning plans and demo learners. Their statuses (demonstrated, needs practice, in progress, not assessed) come from real attempt records. Their resume codes are written to the gitignored `demo-learner-codes.local.txt`.

`supabase/seed.sql` is generated from `src/lib/content/seed.ts` (`npm run seed:sql`), so local and hosted answer keys never drift apart.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | Lint + type check + tests |
| `npm test` | 89 Vitest tests: scoring, answer keys, payload sanitisation, validation, routing, authorization, analytics, recommendations |
| `npm run eval -- --rules` | Offline classifier evaluation on labelled fixtures (rule-based baseline) |
| `npm run eval` | Same, with Claude. **Makes real, billed API calls** |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` from the verified bank |
| `npm run populate:demo` | Create demo classrooms in a Supabase project |
| `npm run populate:plans` | Add fictional demo learning plans + learners (writes resume codes to a gitignored file) |

## Project structure

```
src/
  app/                 pages (student, host) and API routes
  components/          UI, accessibility controls, read-aloud, fraction bars
  lib/
    content/           skills, taxonomies, verified questions, practice, activities
    analysis/          analyser interface, Claude + rule-based providers, validation, fixtures
    services/          all business logic and ownership checks
    db/                Supabase and local storage adapters
    scoring.ts  routing.ts  analytics.ts  recommend.ts  authz.ts
supabase/              migration (schema + RLS), generated seed, config
scripts/               eval, seed generator, demo populator
```

Reading and math share one sprint engine. Only the content, rubrics, and practice differ, so new grades, subjects, or skills are data changes.

---

## Status

**Verified**
- **Live production deployment** on Vercel + Supabase, tested end to end:
  - sign-up, join, scoring, and duplicate rejection
  - practice → comeback
  - live dashboard updates
  - access control: other students and hosts get 404, no session gets 401
- **Checks:** lint, type checking, the production build, and 89 automated tests all pass.
- **Claude classification** (`claude-opus-5-5`, prompt `classify-v1`) on the 31 developer-written labelled fixtures:
  - **31 of 31** matched the expected label.
  - **0 of 7** vague, guess or injection cases got a specific diagnosis.
  - All 22 evidence quotes it returned were verified in the student's text.
  - 0 API failures.
- **AI analysis is live on the production site**, and its two live AI flows have been tested there:
  - **Clarification:** a vague answer got a friendly AI follow-up question (without revealing the answer), the reply was re-analysed and routed to targeted practice, and a second clarification was rejected.
  - **Teacher insight:** generated by Claude on Room 5B Math. It cited only computed figures, chose activities from the curated library, and flagged the data as synthetic.
- **Rule-based baseline** on the same set: 22 of 31 (71%).
- **Demo classroom data:** the fictional students' analyses appear on dashboards as **"Demo data"**, not as AI analysis. They were generated before AI was enabled, and their stored records keep the true provider (rule-based). Anything a real participant submits is analysed by Claude and labelled "AI analysis".

**Not yet verified / known gaps**
- **Evaluation scope:** the fixtures are a small set written by the developer, not real student responses. A perfect score there does not establish accuracy in real classrooms.
- **Manual testing:** no manual browser or screen-reader accessibility pass yet.
- **Speed:** analysis runs inside the submit request, so students wait for the AI response.
- **Live updates:** they use polling (5 s), not realtime.
- **Missing UI:** questions can't be edited or deleted after creation.
- **Host accounts:** email confirmation is off for the demo, so anyone can create a host account.

A successful comeback is an observed follow-up result. It is not proof of lasting learning or a causal effect.
