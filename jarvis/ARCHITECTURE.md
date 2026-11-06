# JARVIS — Architecture & Milestone 0

**Owner:** Joshwa
**Status:** Pre-build specification
**Last updated:** September 25, 2026
**Target V1 delivery:** December 2026

---

## 0. Two audiences, one build

JARVIS serves a portfolio reviewer and a daily user. These pull in different directions and the resolution matters:

| | Portfolio reviewer needs | Daily user needs |
|---|---|---|
| Sees | Live URL, clean repo, this document | Accurate data every morning |
| Cares about | Reasoning behind tradeoffs | Zero maintenance burden |
| Never sees | Wake word, Mac companion, voice | — |
| Kills the project by | Nothing (they just browse) | Stale data after week three |

**Resolution:** Milestones 1 through 3 satisfy both. Everything past Milestone 3 serves only the daily user, so it is built after the portfolio value is already banked and deployed.

**The single most important design decision in this document:** progress is *derived*, not *entered*. See section 6.

---

## 1. System architecture

```
┌──────────────────────────────────────────────────────────┐
│  CLIENTS                                                  │
│  Web dashboard (Next.js)   ·   PWA (iPhone)   ·   Mac app │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS / Supabase Realtime
┌────────────────────▼─────────────────────────────────────┐
│  NEXT.JS SERVER (Vercel)                                  │
│                                                           │
│   /api/chat        → Intent router → Context builder      │
│   /api/capture     → Classifier → structured write        │
│   /api/jobs        → Enqueue durable job                  │
│   /api/webhooks/*  → GitHub, Google push notifications    │
│                                                           │
│   ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│   │ Intent Router│→ │Context Packet│→ │ Model Router  │  │
│   │ (Luna, cheap)│  │ (SQL + vec)  │  │ Luna ▸▸ Sol   │  │
│   └──────────────┘  └──────────────┘  └───────┬───────┘  │
│                                                │          │
│   ┌────────────────────────────────────────────▼───────┐  │
│   │ PROGRESS ENGINE (deterministic, $0, no LLM)        │  │
│   │ pace · percent · streaks · score · next action     │  │
│   └────────────────────────────────────────────────────┘  │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  SUPABASE                                                 │
│  Postgres + pgvector · Auth · RLS · Cron · Storage        │
│                                                           │
│  Cron:  05:30 morning brief   ·  21:00 evening review     │
│         Mon 06:00 weekly      ·  */5 job worker           │
│         03:00 nightly derive  ·  00:10 cost rollup        │
└────────────────────┬─────────────────────────────────────┘
                     │
┌────────────────────▼─────────────────────────────────────┐
│  EXTERNAL                                                 │
│  OpenAI · Google Calendar · Gmail · Drive · GitHub        │
└───────────────────────────────────────────────────────────┘

        ┌─────────────────────────────────────────┐
        │  MAC COMPANION (Tauri) — Milestone 6+   │
        │  Wake word (local) · whisper.cpp (local)│
        │  say -v Daniel (local TTS, $0)          │
        │  Computer control · Global shortcut     │
        │  Talks to cloud over authed WebSocket   │
        └─────────────────────────────────────────┘
```

**Why cloud-primary:** your morning brief must fire at 5:30am whether or not the MacBook is open. The Mac is an *interface and an actuator*, never the brain.

---

## 2. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Web | Next.js 15 App Router, TypeScript, Tailwind | Server actions remove half the API surface |
| Charts | Recharts | Timeline and progress arcs without a heavy dep |
| DB | Supabase Postgres + pgvector | One service for DB, auth, cron, storage, vectors |
| Auth | Supabase Auth, single user, RLS on | Costs nothing now, prevents a rewrite later |
| Scheduler | Supabase Cron (pg_cron) | Already in the box |
| Jobs | Postgres table + cron worker | See section 5. Do not add a queue service |
| Runtime AI | OpenAI Responses API | Luna default, Sol on escalation |
| Build AI | Claude Fable 5.1 | Coding agent only, never in the runtime path |
| Hosting | Vercel Hobby | Free, and cron lives in Supabase not Vercel |
| Mac app | Tauri 2 | ~10MB and ~40MB RAM vs Electron's ~250MB |
| STT | whisper.cpp (local) | $0, Apple Silicon Metal accel |
| TTS | macOS `say -v Daniel` | $0, Daniel is the UK English male system voice |
| Wake word | openWakeWord or Porcupine | Local, $0 for personal use |

**Total recurring infrastructure cost: $0 on free tiers.** Free tier is not free: Supabase pauses a free project after 7 days of inactivity, and cron does not run while it is paused. Only OpenAI tokens cost money, and only when `JARVIS_AI_ENABLED=true`.

---

## 3. Database schema

Fourteen tables, down from the 42 in the original spec. Every table removed was ceremony around a single row.

```sql
-- ============ IDENTITY ============
create table profiles (
  id uuid primary key references auth.users(id),
  display_name text not null,
  timezone text not null default 'America/New_York',
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- prefs holds: brief_time, review_time, autonomy_level, accountability_tone,
-- score_weights, quiet_hours, privacy_flags. JSONB because these are read
-- together, never queried individually, and change shape as you tune the system.

-- ============ GOAL HIERARCHY ============
create table domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,              -- Business, Fitness, School, Coding, Life
  color text not null default '#64748b',
  sort_order int not null default 0
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  domain_id uuid references domains(id) on delete set null,
  title text not null,
  description text,
  success_definition text,          -- plain language: what "done" means
  metric_type text not null default 'percent'
    check (metric_type in ('percent','count','binary','value')),
  target_value numeric,
  current_value numeric not null default 0,
  unit text,
  start_date date not null default current_date,
  target_date date,
  priority int not null default 3 check (priority between 1 and 5),
  status text not null default 'active'
    check (status in ('active','paused','completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- NOT stored: progress_percentage, expected_progress, pace_status.
-- All three are computed. Storing them guarantees they go stale.

create table milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  target_value numeric,
  due_date date,
  status text not null default 'pending'
    check (status in ('pending','active','completed','skipped')),
  completed_at timestamptz,
  sort_order int not null default 0
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  goal_id uuid references goals(id) on delete set null,
  name text not null,
  kind text not null default 'software'
    check (kind in ('software','business','school','other')),
  repo_full_name text,              -- "joshwa/jarvis" — drives GitHub auto-derive
  stage text not null default 'building',
  status text not null default 'active',
  meta jsonb not null default '{}'::jsonb
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  parent_id uuid references tasks(id) on delete cascade,   -- subtasks
  goal_id uuid references goals(id) on delete set null,
  milestone_id uuid references milestones(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  notes text,
  scale text not null default 'micro' check (scale in ('macro','micro')),
  status text not null default 'todo'
    check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority int not null default 3 check (priority between 1 and 5),
  due_at timestamptz,
  estimate_minutes int,
  completed_at timestamptz,
  auto_source text,                 -- 'github','calendar','gmail', null = manual
  auto_ref text,                    -- commit SHA, event id, message id
  created_at timestamptz not null default now()
);
create index on tasks (user_id, status, due_at);

-- ============ THE LEDGER ============
create table activity_events (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  event_type text not null,        -- task_completed, commit_pushed, workout_logged,
                                    -- application_submitted, habit_done, focus_session
  occurred_at timestamptz not null default now(),
  goal_id uuid references goals(id) on delete set null,
  milestone_id uuid references milestones(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  quantity numeric not null default 1,
  xp int not null default 0,
  source text not null default 'manual',   -- manual, github, calendar, gmail, jarvis
  external_ref text,                        -- dedupe key for webhook replays
  meta jsonb not null default '{}'::jsonb
);
create index on activity_events (user_id, occurred_at desc);
create unique index on activity_events (source, external_ref)
  where external_ref is not null;
-- ^ This one index is what makes webhook retries safe. Do not skip it.

-- This table is append-only and is the single source of truth for all progress.
-- Every number on the dashboard is a SELECT over this table. Nothing is
-- incremented in place, so nothing can drift.

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  cadence text not null default 'daily',
  target_per_week int not null default 7,
  domain_id uuid references domains(id) on delete set null,
  active boolean not null default true
);
-- Habit completions are activity_events with event_type='habit_done'.
-- No separate habit_logs table.

-- ============ MEMORY ============
create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null
    check (kind in ('profile','preference','episodic','project','entity','goal')),
  content text not null,
  entity_name text,                -- "Rutgers", "David Verdugo", "ORACLE"
  importance int not null default 3 check (importance between 1 and 5),
  sensitive boolean not null default false,
  embedding vector(1536),          -- only populated when kind is episodic/project
  supersedes uuid references memories(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index on memories using ivfflat (embedding vector_cosine_ops);
-- One table, discriminated by kind. Profile and preference memories are
-- retrieved by SQL on kind, never by vector search. Embeddings are generated
-- only for the two kinds that need semantic recall, which keeps embedding
-- cost near zero.

-- ============ DURABLE JOBS ============
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  objective text not null,
  kind text not null,              -- research, code_fix, batch_analysis
  status text not null default 'queued'
    check (status in ('queued','running','waiting_user','waiting_device',
                      'blocked','paused','completed','failed','cancelled')),
  state jsonb not null default '{}'::jsonb,
  -- state holds: plan[], completed_steps[], current_step, findings[],
  -- tool_outputs[], blockers[], last_checkpoint
  attempt int not null default 0,
  max_attempts int not null default 5,
  next_run_at timestamptz,
  cost_cents numeric not null default 0,
  cost_ceiling_cents numeric not null default 50,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on jobs (status, next_run_at);
-- Replaces job_steps, job_events, job_attempts, job_checkpoints,
-- job_dependencies, job_results. The JSONB state column IS the checkpoint.
-- Crash recovery: worker reads state, resumes from current_step. That is it.

-- ============ OBSERVABILITY ============
create table model_runs (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  model text not null,
  feature text not null,           -- chat, brief, review, research, classify
  job_id uuid references jobs(id) on delete set null,
  input_tokens int not null default 0,
  cached_input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_cents numeric not null,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index on model_runs (user_id, created_at desc);

create table daily_scores (
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  score int not null check (score between 0 and 100),
  xp int not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  primary key (user_id, date)
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null,          -- google, github
  scopes text[] not null default '{}',
  status text not null default 'disconnected',
  sync_token text,                 -- Google incremental sync cursor
  last_sync_at timestamptz,
  unique (user_id, provider)
);
-- OAuth refresh tokens live in Supabase Vault, NOT in this table.

create table audit_log (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  action text not null,
  reason text,
  tool text,
  target_table text,
  target_id text,
  permission_level int,
  result text not null default 'success',
  undo_payload jsonb,
  cost_cents numeric not null default 0,
  created_at timestamptz not null default now()
);
-- activity_events = what Joshwa did.  audit_log = what JARVIS did.
```

**Enable RLS on every table** with `user_id = auth.uid()`. Single user today, but adding it later means touching fourteen tables under deadline pressure.

---

## 4. Progress engine (the $0 core)

No LLM ever computes a number. All of these are SQL views or pure TypeScript over `activity_events`.

```
percent_complete   = current_value / target_value
expected_progress  = (today - start_date) / (target_date - start_date)
pace_delta         = percent_complete - expected_progress
pace_status        = delta > +0.10  → ahead
                     delta > -0.05  → on_track
                     delta > -0.15  → slightly_behind
                     delta > -0.30  → behind
                     else           → at_risk
```

`current_value` is itself a rollup: `SUM(quantity)` over activity_events filtered to the goal. Never a stored counter.

**Daily score** (weights configurable in `profiles.prefs.score_weights`):

| Performance component | Weight | Measurable when |
|---|---|---|
| Priority task execution | 0.35 | A task was due today |
| Goal progress today | 0.25 | An active goal has a deadline |
| Habit consistency | 0.15 | A near-daily habit is active and it is not a rest day |
| Schedule adherence | 0.10 | A calendar event was scheduled |
| Focus blocks completed | 0.10 | A focus session was logged |

- A component with nothing to measure is **null, never zero**. "Nothing was scheduled" must not read the same as "scheduled and missed".
- Weight is redistributed only among measurable components.
- Fewer than **two** measurable components shows **"Score unavailable"** with a coverage readout (N of 5), not a number.
- **Review check-in is not part of the score.** It is a separate consistency indicator. (Changed November 2026: previously 5% of the score, which let a review-only day score 100 and an empty day score 0.)

Rest days and deliberately rescheduled work do not reduce the score. A score that punishes legitimate planning is a score you will start ignoring.

---

## 5. Job engine

One table, one cron worker at `*/5 * * * *`.

```
SELECT * FROM jobs
WHERE status IN ('queued','running')
  AND (next_run_at IS NULL OR next_run_at <= now())
ORDER BY created_at LIMIT 3;
```

For each job: load `state`, execute the next step, write `state` back, update status. A crash mid-step loses at most one step, because the checkpoint is written after every step.

**Retry policy:** exponential backoff at 1, 5, 25, and 125 minutes, capped by `max_attempts`.

**Stop conditions.** A job halts when any of these is true:
- Objective met
- User paused or cancelled it
- `attempt >= max_attempts`
- `cost_cents >= cost_ceiling_cents`
- The last two attempts produced identical failures (loop detection)
- It needs the Mac and the Mac is offline (`waiting_device`, resumes on reconnect)
- It needs your approval (`waiting_user`)
- Monthly budget guard is active

This is the safeguard on "only stop unless I tell it to." The *job* stays alive until you cancel it. The *paid computation* stops when it becomes repetitive, blocked, or expensive. Those are different things, and conflating them is how a $10 budget becomes a $60 budget overnight.

---

## 6. Auto-derivation layer

**This is what determines whether JARVIS survives past week three.** Build it in Milestone 2, before the XP system.

| Source | Trigger | Derived event | Config |
|---|---|---|---|
| GitHub | Push webhook | `commit_pushed` → closes tasks via `Closes #12` or fuzzy title match → advances `project.goal_id` | `projects.repo_full_name` |
| Google Calendar | Push notification | Past event with no decline → `calendar_event_attended` → schedule adherence | Sync token on `integrations` |
| Gmail | Nightly poll | Interview/offer/rejection classified → career pipeline stage advance | Rules first, Luna only on ambiguity |
| Focus mode | Session end | `focus_session` with duration → score + XP | In-app |
| Manual | Quick capture | Gym, reading, anything with no API | Voice or text |

**Nightly derivation cron at 03:00** does a full reconciliation sweep: recompute every goal's `current_value` from the event ledger, detect tasks closed by commits since the last run, flag goals whose last activity is more than 14 days old.

**Why this matters more than any other feature:** you log diligently for two weeks. Then midterms hit. By late October the dashboard claims JARVIS is at 38% when you shipped it. The moment the numbers are wrong once, you stop trusting the score, and the whole system becomes a chore you avoid. GitHub commits alone will carry the coding and trading domain with zero input from you, which is where most of your hours will go anyway.

---

## 7. Model routing

| Intent | Model | Est. tokens (in/out) |
|---|---|---|
| Intent classification | Luna | 400 / 30 |
| Quick capture classify | Luna | 500 / 80 |
| Progress update extraction | Luna | 800 / 120 |
| Chat / status query | Luna | 3k / 400 |
| Morning brief | Luna | 4k / 600 |
| Evening review | Luna | 3k / 400 |
| Weekly launch | Luna | 8k / 1k |
| Email classification | Luna (rules first) | 1k / 50 |
| Goal decomposition | **Sol** | 3k / 1.5k |
| Deep research | **Sol** | 60k / 8k |
| Hard debugging | **Sol** | 20k / 4k |
| Strategic planning | **Sol** | 10k / 3k |

**Escalation gate.** Before any Sol call, the router checks in order: can deterministic code answer this; can retrieval shrink the context enough for Luna; is there a cached research report; is remaining monthly budget above the restricted threshold. Sol only after all four clear.

**Target: 95% of calls on Luna.**

Model IDs live in `lib/ai/models.ts` as config. Never hardcode them in call sites. This lineup will move again within six months.

---

## 8. Cost model

Verified September 25, 2026. Cached input gets a 90% discount.

| Model | Input | Cached input | Output |
|---|---|---|---|
| GPT-6 Luna | $0.10/M | $0.01/M | $0.50/M |
| GPT-6 Sol | $2.00/M | $0.20/M | $10.00/M |

**Projected monthly spend:**

| Feature | Volume | Model | Monthly |
|---|---|---|---|
| Morning brief | 30 | Luna | $0.02 |
| Evening review | 30 | Luna | $0.02 |
| Weekly launch | 4 | Luna | $0.01 |
| Chat (25/day) | 750 | Luna | $0.24 |
| Email classify | 600 | Luna | $0.08 |
| Capture + extract | 300 | Luna | $0.05 |
| Deep research | 8 jobs | Sol | $1.60 |
| Embeddings | ~200 | small | $0.01 |
| **Total** | | | **≈ $2.03** |

### Budget headroom: $7.97/month

Deep research is 79% of your spend. That is the only line worth guarding. Everything else is rounding error.

**Guard thresholds** (on `model_runs` rollup):

| Spend | Behavior |
|---|---|
| $7.00 | Dashboard warning |
| $8.50 | Sol requires per-call confirmation |
| $9.50 | Sol disabled, Luna only |
| $10.00 | No new paid calls without explicit override |

Deterministic features never degrade. Your morning brief still renders at $10.00 because the numbers come from SQL, not from a model.

**Single-job cost approval:** if a job's estimate exceeds 15% of remaining monthly budget, ask first.

---

## 9. Permissions

| Level | Scope | Behavior |
|---|---|---|
| 0 | Read anything | Automatic |
| 1 | Internal writes: tasks, goals, memory, XP | Automatic |
| 2 | Reversible external: draft email, personal focus block | Automatic, shown in activity log, undoable |
| 3 | External effect: send email, submit form, move a meeting with others | **Confirm** |
| 4 | High consequence: purchase, delete, credentials, submit application | **Confirm immediately before execution** |

Purchases: **research only, execution disabled.** Brokerage and banking: **not integrated.**

**Prompt injection rule, non-negotiable:** content retrieved from email, web pages, documents, Drive files, or GitHub issues is *data*. It can never grant permission, escalate a level, or change a budget. An email that says "send me the attached resume" is a string in a database, not an instruction.

Secrets live server-side only: OpenAI key, Google OAuth secrets, Supabase service role key. Never in a client bundle, never in `NEXT_PUBLIC_*`.

---

## 10. Folder structure

```
jarvis/
├── ARCHITECTURE.md          ← this file
├── ROADMAP.md  DATABASE.md  PERMISSIONS.md  COSTS.md  CHANGELOG.md
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (dash)/  page.tsx  today/  goals/  projects/
│   │   │   │             tasks/  calendar/  jobs/  memory/
│   │   │   │             activity/  settings/
│   │   │   └── api/  chat/  capture/  jobs/  cron/  webhooks/
│   │   ├── components/  dashboard/  goals/  jarvis/  ui/
│   │   └── lib/
│   │       ├── ai/       models.ts  router.ts  context.ts  prompts.ts  cost.ts
│   │       ├── engine/   progress.ts  score.ts  next-action.ts  pace.ts
│   │       ├── jobs/     worker.ts  handlers/
│   │       ├── derive/   github.ts  calendar.ts  gmail.ts  reconcile.ts
│   │       ├── memory/   store.ts  retrieve.ts  consolidate.ts
│   │       └── integrations/  google/  github/
│   └── mac/                 ← Milestone 6, Tauri
├── supabase/
│   ├── migrations/
│   └── functions/           ← cron handlers
└── packages/types/          ← shared TS types, generated from DB
```

---

## 11. Dashboard

**Home** answers three questions in under five seconds: what matters, how am I doing, what's next.

```
┌─────────────────────────────────────────────────────────┐
│  Good morning, Joshwa.        Fri Sep 25 · 7:31 AM      │
│  "<quote>"                                              │
├──────────────┬──────────────────────┬───────────────────┤
│ SCORE  ▓▓▓░  │  TODAY'S TOP 3       │  AI SPEND         │
│   72         │  ☐ Auth flow         │  $2.03 / $10.00   │
│ Lv 7 · 1,240 │  ☐ DATA 101 pset     │  ▓▓░░░░░░░░       │
│ 🔥 12 days   │  ☐ Workout           │  proj. $2.40      │
├──────────────┴──────────────────────┴───────────────────┤
│  GOALS                                                   │
│  JARVIS V1      ▓▓▓▓▓▓░░░░ 58%  ● on track   Dec 15     │
│  SWE offer      ▓▓▓░░░░░░░ 31%  ▲ behind     Jan 31     │
│  Bench 225      ▓▓▓▓▓▓▓░░░ 71%  ● on track   Dec 31     │
│  Fall semester  ▓▓▓▓▓░░░░░ 52%  ● on track   Dec 20     │
├──────────────────────────┬───────────────────────────────┤
│  TIMELINE                │  CALENDAR                     │
│  [goal bars, milestone   │  9:00  DATA 101               │
│   pins, today marker,    │  13:00 Free block             │
│   expected vs actual]    │  16:00 Gym                    │
├──────────────────────────┼───────────────────────────────┤
│  ACTIVE JOBS             │  RECENT                       │
│  ▸ Research: wake word   │  ✓ 3 commits → JARVIS  +15 XP │
│    42% · 12 sources      │  ✓ Applied: Wells Fargo +20   │
├──────────────────────────┴───────────────────────────────┤
│  [ Ask JARVIS ______________________________ ] 🎙         │
└──────────────────────────────────────────────────────────┘
```

Nav: Home · Today · Goals · Projects · Tasks · Calendar · Jobs · Memory · Activity · Settings

Command palette on `Cmd+K`.

---

## 12. Milestones

| # | Scope | Ship by | Serves |
|---|---|---|---|
| **0** | This document, migrations, repo skeleton | Sep 28 | Both |
| **1** | Brain: auth, schema, goals, tasks, events, progress engine, text chat, context builder, model router, cost tracker, dashboard | **Oct 12** | Both |
| **2** | Auto-derivation (GitHub, Calendar), Today page, morning brief, evening review, Monday launch, score, XP, timeline | **Oct 26** | Both |
| **3** | Durable jobs, research mode, job center, budget guards | **Nov 9** | Both |
| 4 | Gmail + Drive, draft-with-approval | Nov 23 | Daily |
| 5 | Push-to-talk voice, whisper.cpp, `say -v Daniel` | Dec 7 | Daily |
| 6 | Tauri Mac companion, global shortcut, local notifications | Post-grad | Daily |
| 7 | Local wake word | Post-grad | Daily |
| 8 | Computer control agent | Post-grad | Daily |
| 9 | PWA polish, native iOS only if PWA proves insufficient | Post-grad | Daily |

**Deploy live at the end of Milestone 2 and put the URL on your resume.** Milestone 3 is the strongest portfolio artifact in the list, because durable job orchestration with budget guardrails is a genuine systems-engineering talking point. Milestones 6 through 8 are three separate projects wearing a trenchcoat. Do not start them in a semester where you are also graduating and interviewing.

---

## 13. Definition of done, Milestone 1

All ten must pass:

1. Log in, land on dashboard, see real data from Postgres. No hardcoded values anywhere.
2. Create a goal with domain, metric, target, deadline. It persists.
3. Add milestones and tasks under it. Hierarchy renders correctly.
4. Complete a task. An `activity_events` row is written and goal progress recalculates.
5. Say "I finished the auth flow." Luna matches the task, closes it, writes the event, and replies in under three seconds.
6. Ask "Hi Jarvis, how are we doing in terms of progress towards the goals?" The answer is accurate against the database, names every active goal, and identifies which is furthest behind pace.
7. Pace status is computed, never stored. Change a goal's target date and the status updates on the next read.
8. Every model call writes a `model_runs` row. The cost widget shows a real number.
9. Hard refresh. Every value survives. Nothing lives in React state alone.
10. `npm run lint && npm run typecheck && npm run test && npm run build` all pass clean.

**Item 6 is the north star.** If it works and the answer is right, the foundation is real.

---

## 14. Environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only

# OpenAI
OPENAI_API_KEY=                   # server only
JARVIS_DEFAULT_MODEL=gpt-6-luna
JARVIS_ADVANCED_MODEL=gpt-6-sol
JARVIS_EMBEDDING_MODEL=text-embedding-3-small

# Budget
JARVIS_MONTHLY_BUDGET_CENTS=1000
JARVIS_WARN_CENTS=700
JARVIS_RESTRICT_CENTS=850
JARVIS_HARD_STOP_CENTS=950

# Google (Milestone 4)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# GitHub (Milestone 2)
GITHUB_WEBHOOK_SECRET=
GITHUB_APP_TOKEN=

# Ops
CRON_SECRET=                      # shared secret for Supabase → Next.js cron
JARVIS_TIMEZONE=America/New_York
```

Verify model IDs against the live API before the first deploy. Names change.

---

## 15. Local setup

```bash
npx create-next-app@latest apps/web --typescript --tailwind --app
npm i @supabase/supabase-js @supabase/ssr openai zod date-fns recharts
npx supabase init && npx supabase start
npx supabase db push
npm run dev
```

Seed script creates: 5 domains, 5 goals with real deadlines, 12 milestones, 30 tasks, 60 backdated activity events. **Mark all seed rows `source='seed'` and purge them before the first real use.** Seed data that silently becomes production data is the fastest way to make the dashboard lie.

---

## 16. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Manual logging decays** | **Critical** | Auto-derivation in Milestone 2, before XP |
| Scope creep into voice and Mac | High | Milestones 6 through 8 are post-graduation, no exceptions |
| Model IDs change | Medium | Config only, never hardcoded at call sites |
| Deep research eats the budget | Medium | Per-job cost ceiling, 15% approval gate |
| Google OAuth token expiry | Medium | Refresh handling plus a clear reconnect banner |
| Prompt injection via email or Drive | High | External content is data, never instruction. Level 3+ always confirms |
| Vercel Hobby timeouts on jobs | Low | Job worker runs in Supabase Edge Functions, not Vercel routes |
| Building this instead of applying to jobs | **High** | Milestone 2 ships and deploys, then job search takes priority |

---

## 17. First instruction to the coding agent

> Read ARCHITECTURE.md in full. Implement Milestone 1 only.
>
> Start by generating the Supabase migration from section 3 exactly as written, then the TypeScript types, then the progress engine in `lib/engine/` with unit tests, then the context builder and model router, then the dashboard.
>
> Do not implement voice, the Mac companion, Gmail, Drive, or computer control. Do not add tables beyond section 3 without asking. Do not hardcode any dashboard value.
>
> After each stage: run lint, typecheck, tests, and build. Report what changed, what passed, what failed, and what is next. Do not claim a feature works until you have executed it.

---

## 18. Governing principle

JARVIS does not remember because a long conversation stays open. It remembers because information is deliberately persisted, retrieved, updated, and forgotten.

JARVIS is not always working because a model loops forever. It is always capable because jobs persist, cron fires, deterministic code watches state, and the model is invoked only when actual reasoning is required.

**Structured state in Postgres. Arithmetic in TypeScript. Scheduling in cron. Actions in tools. Reasoning in the model, last and least.**
