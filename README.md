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
| **2UT7RF** | Jordan's Fraction Challenge (hosted by a student) | 4 demo students |

**To see the full loop**, join **JJVNCC** and answer the pizza question with **Noah**, explaining *"8 is bigger than 4 so he has more."* You'll get a worked example with fraction bars, then a comeback question worth 50 points.

**To host**, go to **[/host](https://rematch-phi.vercel.app/host)** and create an account. Teachers and students can both host, and you only ever see results for competitions you create. Use **Load labelled demo data** to fill your account with example classes.

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
5. **Optional: demo classrooms.** Set `REMATCH_DEMO_HOST_PASSWORD` in `.env.local` and run:
   ```bash
   set -a; . ./.env.local; set +a
   npm run populate:demo            # add -- --reset to rebuild
   ```
   This creates two demo host logins and 8 competitions. Fictional students are driven through the real scoring, analysis, practice and comeback services, then labelled "(synthetic)".

`supabase/seed.sql` is generated from `src/lib/content/seed.ts` (`npm run seed:sql`), so local and hosted answer keys never drift apart.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | Lint + type check + tests |
| `npm test` | 58 Vitest tests: scoring, answer keys, payload sanitisation, validation, routing, authorization, analytics, recommendations |
| `npm run eval -- --rules` | Offline classifier evaluation on labelled fixtures (rule-based baseline) |
| `npm run eval` | Same, with Claude. **Makes real, billed API calls** |
| `npm run seed:sql` | Regenerate `supabase/seed.sql` from the verified bank |
| `npm run populate:demo` | Create demo classrooms in a Supabase project |

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
- **Checks:** lint, type checking, the production build, and 58 automated tests all pass.
- **Rule-based baseline:** 22 of 31 labelled fixtures (71%) on the developer-written evaluation set. Every evidence quote it returned was valid.

**Not yet verified / known gaps**
- **Claude:** classification hasn't been evaluated against the labelled fixtures yet, so there are no AI accuracy numbers. Run `npm run eval`.
- **Manual testing:** no manual browser or screen-reader accessibility pass yet.
- **Speed:** analysis runs inside the submit request, so students wait for the AI response.
- **Live updates:** they use polling (5 s), not realtime.
- **Missing UI:** questions can't be edited or deleted after creation.
- **Host accounts:** email confirmation is off for the demo, so anyone can create a host account.

A successful comeback is an observed follow-up result. It is not proof of lasting learning or a causal effect.
