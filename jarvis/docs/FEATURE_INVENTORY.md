# Feature inventory

Every dashboard control, sidebar link and API route, as of commit `4ab1329`
(November 5, 2026). Phase 0: this file describes, it does not change anything.

**How to read the Milestone column**

- **M1 · Plan N** means it is in `COMPLETION_PLAN.md` as deliverable N.
- **M1 · gap** means the spec puts it in Milestone 1, but it is not one of the
  five planned deliverables. These need a decision; see the end of this file.
- **M2, M3, M5** follow `ROADMAP.md`.
- **Unscheduled** means the spec mentions it but no milestone owns it. It gets a
  tag and a "not built yet" page, nothing more.

Every control tagged anything other than **Plan N** gets a visible milestone tag
and a "not built yet" page. That work is Plan 6.

---

## 1. Sidebar

| Control | Intended behavior | Current behavior | What it needs to work | Milestone |
|---|---|---|---|---|
| **Command Center** link | Home dashboard | Works. Renders `/` from Postgres, or from the demo fixture without Supabase | Nothing | M1 · done |
| **Goals** link, active count badge | List of goals with computed progress and pace | Badge is correct (active goals). Link goes to `/goals`, which 404s into the generic not-found page | `/goals` list page, goal data access in `lib/db/` | M1 · Plan 1 |
| **Tasks** link, "N due" badge | Task list with complete, edit and filter | Badge is correct (open tasks due today). Link 404s | `/tasks` list page, complete action that writes the ledger | M1 · Plan 1 |
| **Timeline** link | Goal bars, milestone pins, today marker, expected vs actual | 404s into a page that wrongly says it is on the Milestone 1 build order | Milestone tag and a not-built page | M2 |
| **Activity Ledger** link | Read-only, newest-first view of `activity_events` | 404s | Milestone tag and a not-built page | Unscheduled |
| **Calendar** link | Today's calendar from Google sync | 404s | Google Calendar sync (integration, out of scope) | M2 |
| **Projects** link, count badge | Project list tied to goals and repos | Badge counts non-archived projects. Link 404s | Milestone tag and a not-built page | Unscheduled |
| **Memory** link, count badge | Browse and edit stored memories | Badge counts memories. Link 404s | Milestone tag and a not-built page | Unscheduled |
| **Jobs** link, count badge | Job center: running, queued, cost per job | Badge counts running plus queued jobs (always 0). Link 404s | Durable jobs (out of scope) | M3 |
| **Budget** link | Spend breakdown by feature and model | Link 404s. The top bar pill and the Model routing panel already show real spend | Milestone tag and a not-built page | M3 |
| **Voice** link, "DEC 7" tag | Push-to-talk | Rendered with no `href` and dimmed. Already tagged | Nothing until M5 | M5 |
| **Today's score** card (score, level, XP, streak) | Honest daily performance score | Shows a number every day. Review check-in is counted as a performance component, an empty day scores 0, a review-only day scores 100, and unmeasurable days are indistinguishable from bad ones | Score correctness fix: coverage rule, review moved to a separate indicator | M1 · Plan 2 |
| **Start focus block** button | Starts a focus block and records it | Disabled. Its tooltip says "wired with /api/capture", which is wrong | Focus action that writes one `focus_session` event | M1 · Plan 5 |

## 2. Top bar

| Control | Intended behavior | Current behavior | What it needs to work | Milestone |
|---|---|---|---|---|
| **AI budget** pill | Month-to-date spend vs $10, colored by budget state | Works. Reads `model_runs` for the current local month | Nothing | M1 · done |
| **DEMO DATA** pill | Warns that numbers come from the fixture | Works. Shown only without Supabase config | Nothing | M1 · done |
| **Clock** | Local date and time | Works | Nothing | M1 · done |
| **Search** box, ⌘K hint | Command palette over goals, tasks, memory | A non-focusable `div`. Does nothing. ⌘K is not bound | Milestone tag. Command palette is not on the roadmap | Unscheduled |
| **Notifications** bell | Notification list | A `span`. Does nothing, not focusable | Milestone tag | Unscheduled |
| **User** pill (name, school, avatar) | Account menu, including sign out | Display only. **No sign-out control exists anywhere in the app** | Sign-out server action and a menu | M1 · gap |

## 3. Dashboard panels

| Control | Intended behavior | Current behavior | What it needs to work | Milestone |
|---|---|---|---|---|
| **System overview** rows | Status of engine, ledger, memory, jobs, auto-derive | Display only, values are real counts | Nothing | M1 · done |
| **Goal orbit** and legend | Actual vs expected per goal | Display only, computed from the ledger. Native tooltips on rings | Nothing | M1 · done |
| **Quick command: Log progress** | Opens capture | Dead button tagged "step 5". `/api/capture` now exists but nothing calls it from here | Focus the Ask bar in capture mode, or post to `/api/capture` | M1 · Plan 3 |
| **Quick command: Add a task** | New task form | Dead button tagged "step 6" | Link to `/tasks/new` | M1 · Plan 1 |
| **Quick command: Start a focus block** | Same as the sidebar button | Dead button tagged "step 5" | Same focus action as the sidebar | M1 · Plan 5 |
| **Quick command: Deep research** | Enqueue a research job | Dead button tagged "~20¢ · M3" | Durable jobs (out of scope) | M3 |
| **Quick command: Evening review** | Run the review now | Dead button tagged "M2" | Review prompt plus cron (out of scope) | M2 |
| **Active goals: "All N ›"** link | Goals list | Links to `/goals`, which 404s | `/goals` page | M1 · Plan 1 |
| **Active goals: goal cards** | Open the goal's detail page | Not clickable | Link each card to `/goals/[id]` | M1 · Plan 1 |
| **Active goals: + New goal** | New goal form | Links to `/goals/new`, which 404s | `/goals/new` page | M1 · Plan 1 |
| **Priority: task rows** | Open or complete the task | Display only. Ranking and chips are correct | Link to `/tasks/[id]` | M1 · Plan 1 |
| **Priority: "Add one"** button | New task prefilled with the slipping goal | Links to `/tasks/new?goal=<id>`, which 404s | `/tasks/new` honoring `?goal=` | M1 · Plan 1 |
| **Priority: Due today** list | Today's due tasks and calendar | Shows tasks due today only. Labeled "calendar sync · M2" | Nothing for tasks. Calendar entries need M2 | M1 · done (tasks) |
| **Signals** rings | Budget used, goals on pace, habit consistency | Display only, real numbers | Nothing | M1 · done |
| **Ledger** sparkline and stats | Events per day, totals, auto-derived share | Display only, real numbers, native tooltips | Nothing | M1 · done |
| **Ledger: auto-derived line** | "N commits closed M tasks" in the last 24 hours | Shown when present. Always absent in real use until GitHub sync exists | GitHub webhook (out of scope) | M2 |
| **Model routing** rows | Luna and Sol share and cost, cache rate | Display only, real numbers from `model_runs` | Nothing | M1 · done |

## 4. Footer

| Control | Intended behavior | Current behavior | What it needs to work | Milestone |
|---|---|---|---|---|
| **Location, Graduation, Milestone** facts | Context at a glance | Display only. Read from `profiles.prefs` and the active milestone | Nothing | M1 · done |
| **Ask bar** input | Ask JARVIS anything | Works. Posts to `/api/chat`, shows the reply and whether it came from the engine or a model | Nothing for chat. Capture replies need an Undo button (Plan 3) | M1 · Plan 3, 4 |
| **Ask bar: "Use the advanced model"** | Confirms a Sol call in the restrict band | Works. Resends with `confirmAdvanced: true` | Nothing | M1 · done |
| **Ask bar: dismiss ×** | Close the reply | Works | Nothing | M1 · done |
| **Ask bar: mic** | Push-to-talk | A `span` with a tooltip. Does nothing | Nothing until M5 | M5 |
| **Morning brief** button | Show today's brief | `aria-disabled` but still looks active and has no handler | Brief prompt plus cron (out of scope) | M2 |

## 5. Pages and routes

| Route | Intended behavior | Current behavior | What it needs to work | Milestone |
|---|---|---|---|---|
| `GET /` | Dashboard | Works. Redirects to `/login` when Supabase is configured and no one is signed in | Nothing | M1 · done |
| `GET /login` + `sendMagicLink` server action | Magic-link sign-in, existing user only | Implemented. Never run against a real Supabase project | A Supabase project and a manual sign-in check | M1 · done, unverified |
| `GET /auth/callback` | Exchange code for session | Implemented. Never run against a real project | Same as above | M1 · done, unverified |
| `middleware.ts` (every request) | Refresh the session cookie | Implemented. No-op without Supabase | Same as above | M1 · done, unverified |
| Any unknown path (`not-found.tsx`) | Clear "not built yet" with the right milestone | One generic page for every path. Says "on the Milestone 1 build order" even for M2, M3 and unscheduled pages | Per-route not-built pages with a milestone tag | Plan 6 |
| `POST /api/chat` | Intent router, engine-first answers, cost-tracked model calls | Works in demo mode (engine answers only). Rules first, Luna classify on a miss. `status_query` and `next_action` answer from the engine at hard_stop, with no key, or on model failure. `progress_report` hands off to capture. Never run with a real OpenAI key | Real-key check. Hand-off to the new capture (Plan 3) | M1 · Plan 4 |
| `POST /api/capture` | Close the right task from free text, with Undo | Rule-based token match, then Luna over all open task titles. Validates by **title**, not id. Writes task status, ledger row and `audit_log`. Also logs non-task events (applications, workouts) from model extraction. **No Undo.** Never run with real keys | Plan 3 redesign: deterministic candidates, model picks an id from the short list, id validated in the DB, compensating-event Undo | M1 · Plan 3 |
| `/goals`, `/goals/new`, `/goals/[id]` | Goal CRUD with milestones | Do not exist | Plan 1 | M1 · Plan 1 |
| `/tasks`, `/tasks/new`, `/tasks/[id]` | Task CRUD and completion | Do not exist | Plan 1 | M1 · Plan 1 |
| `/timeline`, `/calendar`, `/jobs`, `/budget` | See sidebar | Do not exist | Not-built page with tag | M2, M2, M3, M3 |
| `/activity`, `/projects`, `/memory` | See sidebar | Do not exist | Not-built page with tag | Unscheduled |
| `/api/cron/morning-brief`, `evening-review`, `weekly-launch` | Cron targets | Referenced (commented out) in `20260928000100_cron.sql`. Do not exist | Out of scope | M2 |
| `/api/cron/score-rollup` | Nightly `daily_scores` write | Referenced (commented out). Does not exist. Note: `daily_scores.score` is `NOT NULL`, so "Score unavailable" cannot be stored until that column changes | Out of scope | M2 |
| `/api/cron/job-worker`, `/api/jobs` | Durable jobs | Referenced. Do not exist | Out of scope | M3 |
| `/api/webhooks/*` | GitHub and Google push | Referenced in ARCHITECTURE section 1. Do not exist | Out of scope | M2 |
| Nightly reconcile (pg_cron, SQL only) | Rebuild `goals.current_value` from the ledger | Scheduled in the migration. Runs inside Postgres, no route needed | A deployed Supabase project | M1 · done, unverified |

---

## Gaps that need a decision

These are Milestone 1 by the spec, but none of the five planned deliverables
covers them. Each gets a one-line recommendation; nothing is built until you say so.

1. **Sign out.** No control exists. Recommend adding it to Plan 1. It is one
   server action and one menu item, about 20 minutes.
2. **Definition of done #1 to #9 have never been run against a real Supabase
   project and OpenAI key.** Every check so far is unit tests plus demo mode.
   Plan 4 includes one manual pass with real keys.
3. **Profile weights are ignored.** `profiles.prefs.score_weights` is seeded but
   `computeDailyScore` always uses the hard-coded defaults. Recommend folding it
   into Plan 2, since Plan 2 changes the weight table anyway.
4. **Stale tags.** Quick command tags say "step 5" and "step 6" (build steps that
   are done), and the focus button tooltip is wrong. Plan 6 replaces them.
