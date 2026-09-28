-- JARVIS initial schema
-- Milestone 1. Fourteen tables.
--
-- Design rules enforced here:
--   1. No derived value has a column. Progress, pace, and scores are computed on read.
--   2. activity_events is append-only and is the source of truth for all progress.
--   3. RLS on every table, always.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ============================================================
-- IDENTITY
-- ============================================================

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  timezone     text not null default 'America/New_York',
  prefs        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

comment on column profiles.prefs is
  'brief_time, review_time, autonomy_level, accountability_tone, score_weights, quiet_hours. Read together, never queried individually.';

-- ============================================================
-- GOAL HIERARCHY
-- ============================================================

create table domains (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null,
  color      text not null default '#64748b',
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  domain_id          uuid references domains(id) on delete set null,
  title              text not null,
  description        text,
  success_definition text,
  metric_type        text not null default 'percent'
                     check (metric_type in ('percent','count','binary','value')),
  target_value       numeric,
  current_value      numeric not null default 0,
  unit               text,
  start_date         date not null default current_date,
  target_date        date,
  priority           int  not null default 3 check (priority between 1 and 5),
  status             text not null default 'active'
                     check (status in ('active','paused','completed','abandoned')),
  source             text not null default 'user',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint goals_dates_ordered check (target_date is null or target_date >= start_date)
);

comment on column goals.current_value is
  'CACHE ONLY. Recomputed from activity_events by the nightly reconcile job. Never the source of truth.';
comment on table goals is
  'NOT stored here: progress_percentage, expected_progress, pace_status, days_remaining. All computed in lib/engine/progress.ts.';

create index goals_user_status_idx on goals (user_id, status, target_date);

create table milestones (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references goals(id) on delete cascade,
  title        text not null,
  target_value numeric,
  due_date     date,
  status       text not null default 'pending'
               check (status in ('pending','active','completed','skipped')),
  completed_at timestamptz,
  sort_order   int  not null default 0,
  source       text not null default 'user',
  created_at   timestamptz not null default now()
);

create index milestones_goal_idx on milestones (goal_id, sort_order);

create table projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  goal_id        uuid references goals(id) on delete set null,
  name           text not null,
  kind           text not null default 'software'
                 check (kind in ('software','business','school','other')),
  repo_full_name text,
  stage          text not null default 'building',
  status         text not null default 'active'
                 check (status in ('active','paused','shipped','archived')),
  meta           jsonb not null default '{}'::jsonb,
  source         text not null default 'user',
  created_at     timestamptz not null default now()
);

comment on column projects.repo_full_name is
  'e.g. "joshwa/jarvis". Drives GitHub auto-derivation in Milestone 2.';

create index projects_user_idx on projects (user_id, status);

create table tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  parent_id        uuid references tasks(id) on delete cascade,
  goal_id          uuid references goals(id) on delete set null,
  milestone_id     uuid references milestones(id) on delete set null,
  project_id       uuid references projects(id) on delete set null,
  title            text not null,
  notes            text,
  scale            text not null default 'micro' check (scale in ('macro','micro')),
  status           text not null default 'todo'
                   check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority         int  not null default 3 check (priority between 1 and 5),
  due_at           timestamptz,
  estimate_minutes int,
  completed_at     timestamptz,
  auto_source      text,
  auto_ref         text,
  source           text not null default 'user',
  created_at       timestamptz not null default now(),
  constraint tasks_done_has_timestamp
    check (status <> 'done' or completed_at is not null)
);

comment on column tasks.auto_source is
  'github | calendar | gmail. Null means manually created.';

create index tasks_user_status_due_idx on tasks (user_id, status, due_at);
create index tasks_goal_idx           on tasks (goal_id) where goal_id is not null;
create index tasks_project_idx        on tasks (project_id) where project_id is not null;

-- ============================================================
-- THE LEDGER
-- Append-only. Never UPDATE, never DELETE. Corrections are
-- new rows with negative quantity.
-- ============================================================

create table activity_events (
  id           bigserial primary key,
  user_id      uuid not null references profiles(id) on delete cascade,
  event_type   text not null,
  occurred_at  timestamptz not null default now(),
  goal_id      uuid references goals(id) on delete set null,
  milestone_id uuid references milestones(id) on delete set null,
  project_id   uuid references projects(id) on delete set null,
  task_id      uuid references tasks(id) on delete set null,
  quantity     numeric not null default 1,
  xp           int not null default 0,
  source       text not null default 'manual',
  external_ref text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

comment on table activity_events is
  'Append-only ledger. Single source of truth for all progress. Every dashboard number is a SELECT over this table.';

create index activity_user_time_idx on activity_events (user_id, occurred_at desc);
create index activity_goal_time_idx on activity_events (goal_id, occurred_at desc)
  where goal_id is not null;
create index activity_type_idx      on activity_events (user_id, event_type, occurred_at desc);

-- This index is what makes webhook retries safe. GitHub replays pushes and
-- Google redelivers notifications. Without it, progress silently inflates.
create unique index activity_dedupe_idx
  on activity_events (source, external_ref)
  where external_ref is not null;

create table habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  name            text not null,
  cadence         text not null default 'daily' check (cadence in ('daily','weekly')),
  target_per_week int  not null default 7 check (target_per_week between 1 and 7),
  domain_id       uuid references domains(id) on delete set null,
  active          boolean not null default true,
  source          text not null default 'user',
  created_at      timestamptz not null default now()
);

comment on table habits is
  'Completions are activity_events with event_type = habit_done. No separate habit_logs table.';

-- ============================================================
-- MEMORY
-- ============================================================

create table memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  kind         text not null
               check (kind in ('profile','preference','episodic','project','entity','goal')),
  content      text not null,
  entity_name  text,
  importance   int  not null default 3 check (importance between 1 and 5),
  sensitive    boolean not null default false,
  embedding    vector(1536),
  supersedes   uuid references memories(id) on delete set null,
  source       text not null default 'user',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table memories is
  'One table discriminated by kind. profile/preference are retrieved by SQL on kind, never vector search. Embeddings only populated for episodic and project.';

create index memories_kind_idx   on memories (user_id, kind, importance desc);
create index memories_entity_idx on memories (user_id, entity_name)
  where entity_name is not null;

-- ivfflat needs rows before it is useful. Create it after seeding real data:
--   create index memories_embedding_idx on memories
--     using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ============================================================
-- DURABLE JOBS
-- One table. The JSONB state column IS the checkpoint.
-- ============================================================

create table jobs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  objective          text not null,
  kind               text not null default 'research',
  status             text not null default 'queued'
                     check (status in ('queued','running','waiting_user','waiting_device',
                                       'blocked','paused','completed','failed','cancelled')),
  state              jsonb not null default '{}'::jsonb,
  attempt            int  not null default 0,
  max_attempts       int  not null default 5,
  next_run_at        timestamptz,
  cost_cents         numeric not null default 0,
  cost_ceiling_cents numeric not null default 50,
  result             jsonb,
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column jobs.state is
  'plan[], completed_steps[], current_step, findings[], tool_outputs[], blockers[], last_checkpoint. Crash recovery reads this and resumes.';

create index jobs_claim_idx on jobs (status, next_run_at)
  where status in ('queued','running');

-- ============================================================
-- OBSERVABILITY
-- ============================================================

create table model_runs (
  id                  bigserial primary key,
  user_id             uuid not null references profiles(id) on delete cascade,
  model               text not null,
  feature             text not null,
  job_id              uuid references jobs(id) on delete set null,
  input_tokens        int not null default 0,
  cached_input_tokens int not null default 0,
  output_tokens       int not null default 0,
  cost_cents          numeric not null default 0,
  latency_ms          int,
  ok                  boolean not null default true,
  created_at          timestamptz not null default now()
);

comment on table model_runs is
  'Every model call writes a row here, including failures. A call that does not record cost is a hole in the budget guard.';

create index model_runs_user_time_idx on model_runs (user_id, created_at desc);
create index model_runs_feature_idx   on model_runs (user_id, feature, created_at desc);

create table daily_scores (
  user_id   uuid not null references profiles(id) on delete cascade,
  date      date not null,
  score     int  not null check (score between 0 and 100),
  xp        int  not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  primary key (user_id, date)
);

create table integrations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  provider     text not null check (provider in ('google','github')),
  scopes       text[] not null default '{}',
  status       text not null default 'disconnected'
               check (status in ('disconnected','connected','error','expired')),
  sync_token   text,
  last_sync_at timestamptz,
  meta         jsonb not null default '{}'::jsonb,
  unique (user_id, provider)
);

comment on table integrations is
  'OAuth refresh tokens live in Supabase Vault, NOT in this table.';

create table audit_log (
  id               bigserial primary key,
  user_id          uuid not null references profiles(id) on delete cascade,
  action           text not null,
  reason           text,
  tool             text,
  target_table     text,
  target_id        text,
  permission_level int check (permission_level between 0 and 4),
  result           text not null default 'success'
                   check (result in ('success','failed','denied','pending_confirm')),
  undo_payload     jsonb,
  cost_cents       numeric not null default 0,
  created_at       timestamptz not null default now()
);

comment on table audit_log is
  'What JARVIS did. activity_events is what Joshwa did. Different tables on purpose.';

create index audit_log_user_time_idx on audit_log (user_id, created_at desc);

-- ============================================================
-- TRIGGERS
-- ============================================================

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger goals_touch before update on goals
  for each row execute function touch_updated_at();
create trigger jobs_touch before update on jobs
  for each row execute function touch_updated_at();

-- Enforce append-only on the ledger at the database level, not just by convention.
create or replace function reject_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'activity_events is append-only. Correct with a new row using a negative quantity.';
end;
$$;

create trigger activity_events_no_update before update on activity_events
  for each row execute function reject_ledger_mutation();
create trigger activity_events_no_delete before delete on activity_events
  for each row execute function reject_ledger_mutation();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles        enable row level security;
alter table domains         enable row level security;
alter table goals           enable row level security;
alter table milestones      enable row level security;
alter table projects        enable row level security;
alter table tasks           enable row level security;
alter table activity_events enable row level security;
alter table habits          enable row level security;
alter table memories        enable row level security;
alter table jobs            enable row level security;
alter table model_runs      enable row level security;
alter table daily_scores    enable row level security;
alter table integrations    enable row level security;
alter table audit_log       enable row level security;

create policy profiles_own on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'domains','goals','projects','tasks','activity_events','habits',
    'memories','jobs','model_runs','daily_scores','integrations','audit_log'
  ]
  loop
    execute format(
      'create policy %I_own on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t);
  end loop;
end $$;

-- milestones has no user_id; it inherits ownership through its goal.
create policy milestones_own on milestones
  for all
  using (exists (
    select 1 from goals g where g.id = milestones.goal_id and g.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from goals g where g.id = milestones.goal_id and g.user_id = auth.uid()
  ));

-- ============================================================
-- RECONCILE
-- Recomputes the goals.current_value cache from the ledger.
-- Run nightly at 03:00 and after any bulk import.
-- ============================================================

create or replace function reconcile_goal_values(p_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  touched int;
begin
  with sums as (
    select g.id as goal_id,
           coalesce(sum(ae.quantity), 0) as total
    from goals g
    left join activity_events ae
      on ae.goal_id = g.id
     and ae.occurred_at >= g.start_date
    where g.user_id = p_user_id
    group by g.id
  )
  update goals g
     set current_value = s.total
    from sums s
   where g.id = s.goal_id
     and g.current_value is distinct from s.total;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

comment on function reconcile_goal_values is
  'Rebuilds the current_value cache from the append-only ledger. The ledger always wins.';
