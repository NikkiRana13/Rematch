-- Rematch MVP schema.
-- All application reads/writes go through server routes using the service-role key, after
-- ownership checks in code. RLS is enabled on every table as defence in depth: hosts can only
-- read their own competitions and associated results; participants never receive Supabase
-- credentials (they use server-issued session tokens), and anonymous clients get no access.

create extension if not exists pgcrypto;

create table public.hosts (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  host_role text not null check (host_role in ('teacher', 'student')),
  created_at timestamptz not null default now()
);

create table public.passages (
  id text primary key,
  subject text not null check (subject in ('reading', 'math')),
  grade_level int not null,
  title text not null,
  body text not null,
  owner_id uuid references public.hosts (id) on delete cascade, -- null = verified library content
  source text not null check (source in ('seed', 'manual')),
  created_at timestamptz not null default now()
);

create table public.practice_resources (
  id text primary key,
  subject text not null check (subject in ('reading', 'math')),
  skill text not null,
  kind text not null check (kind in ('targeted', 'general', 'slip')),
  misconception text,
  title text not null,
  explanation text[] not null,
  worked_example jsonb not null,
  verified boolean not null default false
);

create table public.questions (
  id text primary key,
  version int not null default 1,
  subject text not null check (subject in ('reading', 'math')),
  grade_level int not null,
  skill text not null,
  skill_focus text not null,
  question_role text not null check (question_role in ('initial', 'follow-up')),
  passage_id text references public.passages (id),
  prompt text not null,
  reasoning_prompt text not null,
  answer_choices jsonb not null,
  correct_answer text not null,
  reference_explanation text not null,
  allowed_misconceptions text[] not null default '{}',
  practice_resource_id text references public.practice_resources (id),
  follow_up_question_id text references public.questions (id),
  verified boolean not null default false,
  owner_id uuid references public.hosts (id) on delete cascade,
  source text not null check (source in ('seed', 'manual')),
  created_at timestamptz not null default now(),
  check (follow_up_question_id is null or question_role = 'initial'),
  check (subject <> 'reading' or passage_id is not null)
);

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.hosts (id) on delete cascade,
  title text not null,
  description text not null default '',
  subject text not null check (subject in ('reading', 'math')),
  grade_level int not null,
  status text not null check (status in ('draft', 'open', 'closed')),
  room_code text not null unique,
  question_ids text[] not null default '{}',
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz
);
create index competitions_owner_idx on public.competitions (owner_id);

-- Participant identities: only a SHA-256 hash of the server-issued session token is stored.
create table public.learners (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  nickname text not null,
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  learner_id uuid references public.learners (id) on delete cascade, -- null for synthetic demo participants
  nickname text not null,
  is_synthetic boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (competition_id, learner_id)
);
create index participants_learner_idx on public.participants (learner_id);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  question_id text not null references public.questions (id),
  question_version int not null,
  subject text not null,
  skill text not null,
  kind text not null check (kind in ('initial', 'comeback')),
  original_attempt_id uuid references public.attempts (id) on delete cascade,
  selected_answer text not null,
  is_correct boolean not null,
  points int not null check (points in (0, 50, 100)),
  reasoning text not null default '',
  reasoning_status text not null check (reasoning_status in ('provided', 'not_sure', 'skipped')),
  read_aloud_used boolean not null default false,
  route jsonb,
  clarification_status text not null default 'none' check (clarification_status in ('none', 'requested', 'answered', 'declined')),
  clarification_text text,
  practice_completed_at timestamptz,
  teacher_review boolean not null default false,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  check ((kind = 'comeback') = (original_attempt_id is not null)),
  check (kind = 'initial' or points in (0, 50)),
  check (kind = 'comeback' or points in (0, 100))
);
-- One first attempt per participant per question; one comeback per original attempt.
create unique index attempts_initial_once on public.attempts (participant_id, question_id) where kind = 'initial';
create unique index attempts_comeback_once on public.attempts (original_attempt_id) where kind = 'comeback';
create index attempts_competition_idx on public.attempts (competition_id);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  stage text not null check (stage in ('initial', 'clarification')),
  status text not null check (status in ('completed', 'unavailable')),
  provider text not null,
  model text,
  prompt_version text not null,
  category text,
  evidence_quote text,
  explanation text,
  needs_clarification boolean not null default false,
  clarification_question text,
  error_code text,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  unique (attempt_id, stage),
  check (status = 'completed' or category is null)
);

-- Overrides never delete or modify the original analysis.
create table public.classification_overrides (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  host_id uuid not null references public.hosts (id) on delete cascade,
  category text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  host_id uuid not null references public.hosts (id) on delete cascade,
  provider text not null,
  model text,
  prompt_version text not null,
  status text not null check (status in ('completed', 'unavailable')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.intervention_assignments (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  host_id uuid not null references public.hosts (id) on delete cascade,
  intervention_id text not null,
  rationale text not null default '',
  source text not null check (source in ('ai', 'rule-based')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.hosts enable row level security;
alter table public.passages enable row level security;
alter table public.practice_resources enable row level security;
alter table public.questions enable row level security;
alter table public.competitions enable row level security;
alter table public.learners enable row level security;
alter table public.participants enable row level security;
alter table public.attempts enable row level security;
alter table public.analyses enable row level security;
alter table public.classification_overrides enable row level security;
alter table public.insights enable row level security;
alter table public.intervention_assignments enable row level security;

create function public.owns_competition(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.competitions c where c.id = cid and c.owner_id = auth.uid());
$$;

create policy hosts_self_read on public.hosts for select to authenticated using (id = auth.uid());
create policy hosts_self_update on public.hosts for update to authenticated using (id = auth.uid());

-- Library content (owner_id null) plus own content. Answer keys are never readable by anon.
create policy passages_read on public.passages for select to authenticated using (owner_id is null or owner_id = auth.uid());
create policy passages_insert on public.passages for insert to authenticated with check (owner_id = auth.uid());
create policy questions_read on public.questions for select to authenticated using (owner_id is null or owner_id = auth.uid());
create policy questions_insert on public.questions for insert to authenticated with check (owner_id = auth.uid());
create policy practice_read on public.practice_resources for select to authenticated using (true);

create policy competitions_owner_all on public.competitions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Results: readable only by the owning host. Writes happen server-side only.
create policy participants_host_read on public.participants for select to authenticated using (public.owns_competition(competition_id));
create policy attempts_host_read on public.attempts for select to authenticated using (public.owns_competition(competition_id));
create policy analyses_host_read on public.analyses for select to authenticated
  using (exists (select 1 from public.attempts a where a.id = attempt_id and public.owns_competition(a.competition_id)));
create policy overrides_host_all on public.classification_overrides for all to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy insights_host_read on public.insights for select to authenticated using (public.owns_competition(competition_id));
create policy assignments_host_all on public.intervention_assignments for all to authenticated
  using (public.owns_competition(competition_id)) with check (host_id = auth.uid() and public.owns_competition(competition_id));

-- learners: no policies → only the service role (server) can access token hashes.
