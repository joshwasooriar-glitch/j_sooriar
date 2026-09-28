# ROADMAP

Current milestone: **1**. Ship dates assume roughly 10 to 15 hours a week.

---

## Milestone 1 — The brain (ship by Oct 12)

Auth, schema, goals, milestones, tasks, activity events, progress engine, text
chat, context builder, model router, cost tracker, dashboard.

**Definition of done.** All ten must pass:

1. Log in, land on dashboard, see real data from Postgres. No hardcoded values.
2. Create a goal with domain, metric, target, deadline. It persists.
3. Add milestones and tasks under it. Hierarchy renders correctly.
4. Complete a task. An `activity_events` row is written and goal progress recalculates.
5. Say "I finished the auth flow." Luna matches the task, closes it, writes the event, replies in under three seconds.
6. Ask "Hi, how are we doing in terms of progress towards the goals?" The answer is accurate against the database, names every active goal, and identifies which is furthest behind pace.
7. Pace is computed, never stored. Change a goal's target date and status updates on next read.
8. Every model call writes a `model_runs` row. The cost widget shows a real number.
9. Hard refresh. Every value survives. Nothing lives in React state alone.
10. `npm run lint && npm run typecheck && npm run test && npm run build` pass clean.

**Item 6 is the north star.** It is the first sentence Joshwa said he wanted to
say to JARVIS. If it works and the answer is right, the foundation is real.

### Build order within Milestone 1

1. Migration and RLS policies, then `npx supabase gen types typescript`
2. Seed script (marked `source='seed'`, purgeable)
3. `lib/engine/` with full unit tests — **do this before any UI**
4. `lib/ai/models.ts`, `cost.ts`, `router.ts`, `context.ts`, `prompts.ts`
5. `/api/chat` and `/api/capture`
6. Dashboard, goals, tasks pages
7. End-to-end pass against the ten criteria above

---

## Milestone 2 — Auto-derivation and the daily loop (ship by Oct 26)

GitHub webhook, Google Calendar sync, Today page, morning brief (5:30am),
evening review (9:00pm), Monday launch (6:00am), daily score, XP, goal timeline.

**Build auto-derivation before XP.** A score computed from hand-entered data
becomes wrong the first busy week, and a score you don't trust is worse than no
score.

**Deploy live at the end of this milestone. Put the URL on the resume.**

---

## Milestone 3 — Durable jobs (ship by Nov 9)

Job table worker, research mode, job center UI, budget guards, cost ceilings,
loop detection.

This is the strongest portfolio artifact in the whole roadmap. Durable job
orchestration with cost-aware model escalation is a real systems engineering
conversation in an interview.

---

## Milestone 4 — Gmail and Drive (Nov 23)
Read, classify, draft with approval. Never auto-send.

## Milestone 5 — Voice, push to talk (Dec 7)
whisper.cpp for input, `say -v Daniel` for output. Both local, both $0.

---

## Post-graduation

| # | Scope |
|---|---|
| 6 | Tauri Mac companion, global shortcut, local notifications |
| 7 | Local wake word |
| 8 | Computer control agent |
| 9 | PWA polish, native iOS only if PWA proves insufficient |

Milestones 6 through 8 are three separate projects wearing a trenchcoat. Do not
start them in a semester that also contains graduation and a job search.
