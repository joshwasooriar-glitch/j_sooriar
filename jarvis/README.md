# JARVIS

A personal operating system with an AI layer on top. Goals, milestones, tasks,
an append-only activity ledger, a deterministic progress engine, and a chat
interface that reads computed numbers rather than calculating them.

Built to run on **under $10 a month** in LLM API spend. Current projection: **$2.03**.

## What "$0" means here

Wherever this repo says **$0**, it means **$0 of LLM API spend**: the progress
engine, the dashboard, capture, and the status answer never call a model.

Infrastructure is **free tier, not free.** It costs nothing while usage stays
inside the free limits of Supabase and Vercel, and those limits have rules:

- **Supabase pauses a free-tier project after 7 days of inactivity.** A paused
  project serves nothing and its pg_cron jobs, including the nightly reconcile,
  do not run until you restore it from the Supabase dashboard. If JARVIS goes
  unused for a week, expect to un-pause it.
- Vercel Hobby has its own limits on function duration and usage.

AI is **off by default.** Set `JARVIS_AI_ENABLED=true` (server-side) to allow
model calls at all; with it off, no model request is made under any intent or
budget state, and the dashboard reads **AI OFF**.

---

## Dashboard data flow

```
Postgres (RLS) ──> lib/db/dashboard.ts ──> DashboardSnapshot   raw rows, Zod-parsed
                                                 │
                   lib/dashboard/view-model.ts <─┘              pure, time injected
                   uses lib/engine + lib/ai/cost
                                                 │
                   components/dashboard/* <──────┘              render only
```

Goal values on the dashboard are recomputed from `activity_events` on every
read. The `goals.current_value` cache is never displayed.

## The idea

Most personal AI assistants are a chat window with a long conversation history
standing in for memory. That gets expensive fast and it forgets things.

This one puts structured state in Postgres, arithmetic in TypeScript, scheduling
in cron, actions in tools, and reasoning in the model last and least. The model
never computes a number. It reads values the engine already produced and writes
English around them.

The practical consequence: when the monthly budget runs out, the dashboard still
works. Every figure on it came from SQL.

---

## Status

Milestone 1 in progress. See `ROADMAP.md`.

| Piece | State |
|---|---|
| Schema, RLS, triggers, reconcile, ledger functions | Written; **37 database checks** against real Postgres (`npm run test:sql`) |
| Progress engine, score, capture, routing | **262 unit tests** |
| Goals, tasks, milestones, Activity Ledger, focus block | Built |
| Capture with Undo, count confirmation | Built, deterministic, $0 of LLM spend |
| `/api/chat` | Built; answers from the engine with AI off |
| Local real-service acceptance | **10 of 10 steps passed**, see `docs/ACCEPTANCE.md` |
| Hosted-project acceptance | **Not run yet.** Required before merging to `main` |

---

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in Supabase and OpenAI

npx supabase init
npx supabase start
npm run db:push
npm run db:types

# optional: realistic data to develop against. The seed scripts read .env.local
# (tsx --env-file), so put SUPABASE_SERVICE_ROLE_KEY and SEED_USER_ID there.
npm run seed

npm run dev
```

No `.env.local` yet? `npm run dev` still works: the dashboard renders from a
built-in fixture (`lib/db/demo.ts`) and shows a **DEMO DATA** badge. Once
Supabase is configured it requires sign-in and reads Postgres instead.

Before real use: `npm run seed:purge`. Every seeded row is marked `source='seed'`,
and seed data that quietly becomes production data is how a dashboard starts
lying.

---

## Architecture in one diagram

```
Clients (web, PWA, Mac later)
        │
Next.js on Vercel
  intent router (rules first, then a cheap model)
        ↓
  context packet builder (explicit token budget)
        ↓
  model router (Luna by default, Sol through a gate)
        ↓
  PROGRESS ENGINE  ← deterministic, $0, never sees a model
        │
Supabase: Postgres + pgvector + Auth + RLS + Cron
```

Full detail in `ARCHITECTURE.md`.

---

## The rules that make it work

1. **No derived value is stored.** Progress, pace, scores, streaks, and days
   remaining are computed on read. Stored progress fields go stale and lie.
2. **`activity_events` is append-only.** Enforced by a database trigger, not by
   convention. Corrections are new rows with negative quantity.
3. **No LLM computes a number.** Ever.
4. **95% of calls on the cheap model.** The expensive one is reached through a
   four-check gate.
5. **Every model call records its cost,** including failures.
6. **External content is data, never instruction.** Email, web pages, and repo
   text arrive wrapped in `<untrusted_content>` tags and cannot grant
   permission.

The full set is in `CLAUDE.md`, which is also the brief for the coding agent.

---

## Layout

```
├── CLAUDE.md              agent constitution and the ten invariants
├── ARCHITECTURE.md        full spec
├── ROADMAP.md             milestones and definitions of done
├── COSTS.md               pricing, projections, budget guards
├── PERMISSIONS.md         permission levels and prompt-injection rules
├── lib/
│   ├── engine/            pure deterministic core, fully tested
│   │   ├── progress.ts    pace, projection, stalled-goal detection
│   │   ├── score.ts       daily score, streaks, levels
│   │   ├── next-action.ts task ranking
│   │   └── time.ts        local-day and DST-correct date math
│   └── ai/
│       ├── models.ts      the only file that names a model
│       ├── cost.ts        cost math and budget gates
│       ├── router.ts      intent rules, escalation gate
│       ├── context.ts     context packet builder
│       └── prompts.ts     stable system prompt, cacheable
├── supabase/migrations/   schema, cron, seed purge
├── scripts/               seed and purge
└── tests/                 122 tests
```

---

## Testing

```bash
npm run test        # 122 tests
npm run verify      # lint, typecheck, test, build
```

`lib/engine/` requires a unit test for every exported function. It is the system
of record for every number the user sees, and a wrong pace calculation is worse
than a crash because it fails quietly.

Boundary cases are tested explicitly: zero elapsed time, target date in the
past, target value of zero, null target date, negative quantities, goals created
today, and the DST transition.

## Troubleshooting

- **Switched git branches while `npm run dev` was running, and now pages crash
  or half-render** (errors about properties that no longer exist, components
  from the other branch): the dev server's `.next` cache still holds the other
  branch's compiled code. Stop the server, run `rm -rf .next`, and start it
  again. Do this after any branch switch that changes `app/`, `components/` or
  `lib/`.
- **A dashboard panel shows "This panel could not load"**: that panel threw
  while rendering and was contained so the rest of the page still works. The
  browser console has the error. After a branch switch, the fix above clears it.
- **`npm run seed` says Missing env**: the seed scripts read `.env.local`. Put
  `SUPABASE_SERVICE_ROLE_KEY` and `SEED_USER_ID` there.
- **The hosted project stopped responding after a quiet week**: Supabase pauses
  free-tier projects after 7 days of inactivity. Restore it from the Supabase
  dashboard.
