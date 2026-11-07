# Rematch

A hackathon MVP for classroom learning sprints in **reading comprehension** and **math**:

**Attempt → Explain → Diagnose → Practise → Rematch.**

Hosts (teachers or students) launch a short sprint. Participants join with a room code and answer questions, explaining their reasoning as they go. Answers are scored deterministically on the server. An analyser looks for a *likely* misconception, which must be backed by a quote from the student's own explanation. Students then get targeted practice and a verified comeback question. Hosts see live, evidence-backed results with denominators, plus suggested activities that they must review before anything is assigned.

**Live demo:** https://rematch-phi.vercel.app (Vercel + Supabase; reasoning analysis is currently rule-based because no Anthropic key is configured).

> Grade 5 demonstration content. **Ontario curriculum alignment has not been verified.** All demo students and history are fictional and labelled as such.

---

## Quick start (local demo, no external services)

```bash
npm install
npm run dev            # http://localhost:3000
```

With no Supabase variables set, the app runs in **local demo mode**:

- **Data:** stored in `.data/rematch-local.json` on the machine running the server. This is not a shared database and is not meant for real classroom use across devices. A banner says so on every page.
- **Host sign-in:** uses two fictional accounts, *Ms. Rivera* (teacher) and *Jordan* (student host). Demo sign-in is disabled whenever Supabase is configured, and in production builds unless `REMATCH_ALLOW_LOCAL_DEMO=true`.
- **Analysis:** reasoning analysis is **rule-based** unless `ANTHROPIC_API_KEY` is set, and the UI labels which one produced each result.
- **Seed data:** Ms. Rivera's account comes pre-seeded with two open live sprints and two closed **demonstration history** competitions (8 fictional participants each, labelled "synthetic").
- **Reset:** "Reset demo data" on the host dashboard, or delete `.data/`.

### 2-minute demo script

1. **Host:** `/host` → *Continue as Ms. Rivera* → open **Math Rematch: Fraction Face-off** → *Results*. Note the room code.
2. **Student:** in a private window, go to `/join`, enter the code and a nickname, then:
   - Pick **Noah**, explain *"8 is bigger than 4 so he has more"*, and submit.
   - You get targeted practice with fraction bars, then the comeback ribbon question. Answer **Sara** to earn 50 comeback points.
3. **Back on the host results page** (it polls every 5 s), you'll see:
   - Participant count, completion, skill accuracy and comeback success update, each with *n of N*.
   - The misconception card shows the student's quote.
   - Clicking **Generate insight** shows rule-based or AI suggestions; click **I've reviewed this — assign**.
4. **Clarification path:** try *"noah has more"* (vague). You'll get one clarification question, the answer is re-analysed, and the case appears in **Needs your review**.
5. **Reading:** open **Reading Rematch: Clue Detectives** and try read-aloud; its use is recorded and summarised for the host as context only.

---

## Production setup (Supabase + optional Anthropic)

1. Create a Supabase project. Enable Email auth (password).
2. Apply the schema and seed:
   ```bash
   # with the Supabase CLI linked to your project
   supabase db push                      # applies supabase/migrations/*
   psql "$DATABASE_URL" -f supabase/seed.sql   # or paste into the SQL editor
   ```
   `supabase/seed.sql` is **generated** from `src/lib/content/seed.ts` by `npm run seed:sql`, so answer keys stay synchronised between modes.
3. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), and optionally `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` (default `claude-opus-5-5`).
4. `npm run build && npm start`. Sign up as a host at `/host`. Use **Load labelled demo data** to add fictional history to *your own* account.

---

## Checks

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest: scoring, content keys, validation, routing, authorization, analytics, recommendations
npm run eval -- --rules   # offline classifier evaluation (rule-based baseline)
npm run eval              # Anthropic evaluation — makes real, billed API calls; needs ANTHROPIC_API_KEY
```

---

## Architecture

| Area | Where |
|---|---|
| Domain types | `src/lib/types.ts` |
| Subjects, skills, subject-specific taxonomies | `src/lib/content/taxonomy.ts` |
| Verified seed content + intervention library | `src/lib/content/seed.ts` |
| Deterministic scoring (100 first try / 50 comeback) | `src/lib/scoring.ts` |
| Routing & resumable next-step logic | `src/lib/routing.ts` |
| Analyser interface, Anthropic + rule-based providers, validation | `src/lib/analysis/*` |
| Analytics (computed in code) & next-sprint rules | `src/lib/analytics.ts`, `src/lib/recommend.ts` |
| Authorization checks | `src/lib/authz.ts`, `src/lib/auth/*` |
| Services (all ownership checks live here) | `src/lib/services/*` |
| Storage: Supabase (service role, server-only) or local file | `src/lib/db/*` |
| API routes | `src/app/api/**` |
| Schema + RLS | `supabase/migrations/` |

**One shared sprint engine**: reading and math share the same flow; only content, rubrics (taxonomies) and practice differ. New grades/subjects/skills are data: add a skill in `taxonomy.ts`, content in `seed.ts`, and regenerate `seed.sql`.

### Auth & privacy

- **Hosts:** use Supabase Auth (email/password, cookie session via `@supabase/ssr`). Every host route verifies ownership in code (`assertHostOwnsCompetition`) and returns 404 for competitions the host doesn't own. Hosting a sprint gives no access to anyone else's records.
- **Participants:** get a **server-issued random token** in an httpOnly cookie, and only its SHA-256 hash is stored. A nickname or room code is never treated as authorization; tests show that the same nickname from another device sees nothing.
- **Database access:** all privileged DB operations run server-side with the service-role key. RLS is enabled on every table as defence in depth. Anonymous users get nothing, and `learners` has no policies at all.
- **Student payloads:** never include answer keys, reference explanations, misconception lists, or follow-up links. A test checks the payload at each step.
- **No public ranking:** students see only their own progress.

### Scoring & routing rules

- Correctness and points are decided by plain server code before any analysis runs, and the answer and reasoning are stored **before** feedback is shown.
- Unique indexes enforce one first attempt per question and one comeback per original attempt, so duplicates get a 409 and earn no points.
- A comeback is only allowed after an incorrect first attempt, and only for the follow-up the route offered. Comebacks are stored as separate rows linked by `original_attempt_id`.
- Routing by analysis result:

| Analysis result | Route |
|---|---|
| Supported misconception + verified targeted practice + verified same-skill follow-up | targeted practice → comeback |
| Insufficient evidence | one clarification → re-analysis; if still unclear → general practice + teacher-review flag |
| Other misconception | general practice + host review |
| Slip | brief "check your answer" card + fresh same-skill question |
| Correct answer, faulty reasoning | optional practice; no score change, no comeback |
| "I'm not sure" / skipped | accepted; no provider call, no diagnosis |
| Analysis unavailable | general practice, flagged; never a fabricated result |

### AI classification

- **Provider interface:** `ReasoningAnalyzer`. `AnthropicAnalyzer` uses `@anthropic-ai/sdk` with a JSON-schema structured output (`output_config.format`), `effort: low` by default, and the server-side refusal fallback (`fallbacks: "default"`; turn it off with `ANTHROPIC_FALLBACKS=off`).
- **Inputs:** the analyser receives the subject, skill, passage/problem, answer key, reference explanation, the student's answer and reasoning (wrapped as untrusted data), and only that subject's taxonomy.
- **Validation:** every output, AI or rule-based, goes through `validateClassification`:
  - The schema is strict and the category must belong to the subject's taxonomy.
  - Specific categories **must** include an `evidenceQuote` that actually appears in the student's text.
  - `needsClarification` requires a question.
  - Anything invalid is stored as **analysis unavailable**, along with an error code.
- **Stored metadata:** provider, model and prompt version are stored with every analysis.
- **Host overrides:** stored as separate rows; the original analysis is never changed.

### Analytics

- **Completion:** participants who answered every initial question / participants.
- **Skill accuracy:** correct first attempts / first attempts. Comebacks are excluded.
- **Comeback success:** correct comebacks / completed comebacks.
- **Misconception count:** distinct participants with a quote-supported classification (or a host override) / participants whose reasoning was analysed.
- **Limited evidence:** shown when a skill has fewer than 3 distinct first-attempt questions. This is an MVP display rule, not a validated threshold.
- **Insights:** use computed aggregates plus de-identified quotes. AI output is rejected if it cites a percentage that wasn't computed, or references an unknown activity or evidence id. If AI is unavailable, the page shows **labelled rule-based** suggestions.
- **Next-sprint suggestion:** uses explicit rules — at least 2 recent errors and accuracy below 70% → focus, at most 2 questions per focus skill, plus review of other verified skills.

---

## Status: what works vs. what's incomplete

### Working and verified locally

- Local demo end to end, checked over HTTP against the dev server:
  - host sign-in, join by code, answer + reasoning, server scoring
  - duplicate-submission rejection
  - targeted practice → comeback (+50)
  - live host metrics
  - cross-participant and cross-host denial (404) and no-session denial (401)
  - rule-based insight
- 58 unit/integration tests (`npm test`) cover:
  - scoring, answer-key verification of the seed bank, and payload sanitisation
  - classification validation, including fabricated quotes and wrong-subject categories
  - routing for every case above, and resumable next-step logic
  - authorization and duplicates
  - analytics denominators, overrides, and failure storage
  - insight statistic checks and recommendations
- ESLint, `tsc` and `next build` all pass.
- Fully adaptive skills: reading inference (making inferences using textual evidence) and math same-numerator fraction comparison. Both have targeted practice for each supported misconception, general/slip practice, and verified follow-ups.
- Other skills (main idea, vocabulary, supporting evidence, place value, addition/subtraction, division) have verified questions and are labelled **"No adaptive support yet"**.
- Accessibility:
  - keyboard-operable controls with visible focus, a skip link, labelled inputs, and fieldsets
  - adjustable text size and line spacing, persisted per device
  - no timers or speed bonuses
  - read-aloud via `speechSynthesis` with a text fallback, recorded per attempt and shown to hosts as context only
  - `prefers-reduced-motion` respected

### Not verified / incomplete

- **Supabase/Vercel production path:** verified end to end on https://rematch-phi.vercel.app. Host sign-up, loading demo data, join, scoring, duplicate rejection (409), practice → comeback (+50), live host metrics, cross-participant denial (404), no-session denial (401), and demo sign-in disabled in production (404) all worked. Anonymous Supabase clients can't read `questions` (RLS). The individual RLS host policies haven't been tested directly, because the app goes through server routes.
- **Anthropic classification has not been run against the real API** (no key here). The request shape follows the SDK types (`tsc` passes), and with an invalid key all 31 eval calls were correctly recorded as `api_auth_error` / unavailable. **There are no AI accuracy numbers yet.** Run `npm run eval` with a key to get them.
- **Rule-based baseline on the 31 developer-written fixtures:** 22 of 31 (71%). It gave a specific diagnosis to 1 of 7 insufficient-evidence cases, and 0 of its quotes were invalid. Its misses are mostly conservative "insufficient evidence" calls.
- **The UI was checked for successful renders (HTTP 200) and a clean build,** but not clicked through in a real browser or screen reader. A manual accessibility pass (contrast, VoiceOver/NVDA) is still needed.
- Analysis runs synchronously inside the submit request, so the student waits for the AI call (timeout 45 s, 1 retry).
- Supabase sessions are refreshed in route handlers; there's no `proxy.ts` session-refresh middleware.
- Email confirmation is turned off in `supabase/config.toml` for the hackathon, so anyone can create a host account without verifying their email.
- No question editing or versioning UI after creation (versions are stored, starting at 1), and no deletion UI.
- Polling (5 s) instead of realtime.

A successful comeback is an observed follow-up result. It is not evidence of lasting learning or a causal effect.
