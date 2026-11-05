# JARVIS

A personal operating system with an AI layer on top. Goals, milestones, tasks,
an append-only activity ledger, a deterministic progress engine, and a chat
interface that reads computed numbers rather than calculating them.

Built to run on **under $10 a month** in API spend. Current projection: **$2.03**.

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
| Schema, RLS, triggers, reconcile | Written |
| Progress engine + tests | **146 tests passing** |
| Cost accounting and budget guards | Written and tested |
| Intent router and context builder | Written and tested |
| Next.js app shell, magic link auth | Written |
| Command center dashboard | Written, reads the engine |
| Chat, capture, goals and tasks pages | Not started |

---

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in Supabase and OpenAI

npx supabase init
npx supabase start
npm run db:push
npm run db:types

# optional: realistic data to develop against
SEED_USER_ID=<your auth.users id> npm run seed

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
