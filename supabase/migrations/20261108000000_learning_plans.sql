-- Learning plans, objective mappings, roadmap progress overrides, and learner resume codes.
-- Additive only: existing rows keep their data (new columns have safe defaults).

-- Attempts: roadmap rematch kind + independence tracking.
alter table public.attempts drop constraint if exists attempts_kind_check;
alter table public.attempts add constraint attempts_kind_check check (kind in ('initial', 'comeback', 'roadmap'));
alter table public.attempts add column if not exists independent boolean not null default true;
alter table public.attempts add column if not exists support text not null default 'none'
  check (support in ('none', 'answer_previously_revealed'));
alter table public.attempts add column if not exists objective_id uuid;
alter table public.attempts add constraint attempts_roadmap_no_points check (kind <> 'roadmap' or points = 0);
create index if not exists attempts_question_idx on public.attempts (question_id);

-- Competitions: hidden per-plan practice spaces.
alter table public.competitions add column if not exists is_practice_space boolean not null default false;

-- Learners: private resume code (hash only) + synthetic flag; extra device sessions.
alter table public.learners add column if not exists resume_code_hash text unique;
alter table public.learners add column if not exists is_synthetic boolean not null default false;

create table public.learner_sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.hosts (id) on delete cascade,
  title text not null,
  subject text not null check (subject in ('reading', 'math', 'mixed')),
  course_label text not null default '',
  description text not null default '',
  unit_label text not null default 'Lecture' check (unit_label in ('Lecture', 'Lesson')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_version int,
  draft_version int,
  evidence_rule jsonb not null,
  source text not null default 'manual' check (source in ('manual', 'import')),
  practice_competition_id uuid references public.competitions (id) on delete set null,
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index learning_plans_owner_idx on public.learning_plans (owner_id);

-- Lectures/objectives/mappings are versioned: published versions are never edited in place.
create table public.learning_plan_lectures (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans (id) on delete cascade,
  plan_version int not null,
  position int not null,
  number int not null,
  title text not null
);
create index learning_plan_lectures_plan_idx on public.learning_plan_lectures (plan_id, plan_version);

create table public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans (id) on delete cascade,
  plan_version int not null,
  lecture_id uuid not null references public.learning_plan_lectures (id) on delete cascade,
  objective_key text not null,
  position int not null,
  text text not null,
  skill text,
  required boolean not null default true,
  needs_review boolean not null default false,
  review_note text,
  source_quote text
);
create index learning_objectives_plan_idx on public.learning_objectives (plan_id, plan_version);

create table public.objective_question_mappings (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.learning_objectives (id) on delete cascade,
  plan_id uuid not null references public.learning_plans (id) on delete cascade,
  plan_version int not null,
  question_id text not null references public.questions (id),
  unique (objective_id, question_id)
);
create index objective_question_mappings_plan_idx on public.objective_question_mappings (plan_id, plan_version);

create table public.learning_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (plan_id, competition_id)
);

-- Overrides keep the computed status at the time, and never modify attempts or evidence.
create table public.objective_progress_overrides (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.learning_plans (id) on delete cascade,
  objective_id uuid not null references public.learning_objectives (id) on delete cascade,
  learner_id uuid not null references public.learners (id) on delete cascade,
  host_id uuid not null references public.hosts (id) on delete cascade,
  status text not null check (status in ('not_assessed', 'in_progress', 'needs_practice', 'demonstrated')),
  reason text not null check (length(trim(reason)) > 0),
  computed_status_at_override text not null,
  created_at timestamptz not null default now()
);
create index objective_progress_overrides_lookup on public.objective_progress_overrides (plan_id, learner_id);

-- ---------------------------------------------------------------------------
-- Row level security (server uses the service role after ownership checks;
-- learners never hold Supabase credentials).
-- ---------------------------------------------------------------------------
alter table public.learner_sessions enable row level security;
alter table public.learning_plans enable row level security;
alter table public.learning_plan_lectures enable row level security;
alter table public.learning_objectives enable row level security;
alter table public.objective_question_mappings enable row level security;
alter table public.learning_plan_assignments enable row level security;
alter table public.objective_progress_overrides enable row level security;

create function public.owns_plan(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.learning_plans p where p.id = pid and p.owner_id = auth.uid());
$$;

create policy plans_owner_all on public.learning_plans for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy plan_lectures_owner_all on public.learning_plan_lectures for all to authenticated
  using (public.owns_plan(plan_id)) with check (public.owns_plan(plan_id));
create policy objectives_owner_all on public.learning_objectives for all to authenticated
  using (public.owns_plan(plan_id)) with check (public.owns_plan(plan_id));
create policy mappings_owner_all on public.objective_question_mappings for all to authenticated
  using (public.owns_plan(plan_id)) with check (public.owns_plan(plan_id));
create policy assignments_owner_all on public.learning_plan_assignments for all to authenticated
  using (public.owns_plan(plan_id)) with check (public.owns_plan(plan_id) and public.owns_competition(competition_id));
create policy objective_overrides_owner_all on public.objective_progress_overrides for all to authenticated
  using (public.owns_plan(plan_id)) with check (host_id = auth.uid() and public.owns_plan(plan_id));
-- learner_sessions: no policies → service role only.
