# Completion plan

> **Status, November 5, 2026: built.** All six items are implemented, and the
> local real-service acceptance run passed (`ACCEPTANCE.md`). The hosted-project
> run is still required before merging to `main`. Where the build follows the
> later clarifications instead of this plan:
>
> - **Capture is fully deterministic** (token-set match, regex quantities). No
>   model selects from the short list, and no model is called anywhere in capture.
> - **Count goals log through capture,** with a confirmation showing the goal,
>   quantity and resulting progress, instead of a form on the goal page.
> - **Undo and reverse use one Postgres function,** `reverse_activity_event`:
>   30 seconds on the database clock for the toast, no limit on the Activity
>   Ledger page. The Activity Ledger page was built for this (it was unscheduled).
> - **Focus writes one event on Stop,** measured with a monotonic clock and
>   capped at 4 hours, instead of on Start.
> - **`JARVIS_AI_ENABLED`** (default off) was added. The dashboard reads AI OFF.
> - **A signup trigger now creates the profile row.** The acceptance run found
>   that new users could not create goals without it.
>
> The open questions at the end were answered by those clarifications, or by the
> recommended answer where they were silent (questions 4, 5 and 7).

Phase 0 output. The plan below is kept as written. Scope is the five deliverables
below, in order, plus the milestone tags that cover everything else. Every
control and route is listed in `FEATURE_INVENTORY.md`.

**Out of scope, post-graduation:** integrations (GitHub, Google, Gmail, Drive),
durable jobs, research mode, email, voice, and end-to-end test infrastructure.
No new tables.

**Estimates** are in evenings of roughly 2.5 to 3 hours. Each one includes
`npm run verify` and actually exercising the feature, per CLAUDE.md invariant 10.

| # | Deliverable | Evenings | Depends on |
|---|---|---|---|
| 1 | Goals and Tasks CRUD pages | 4 | none |
| 2 | Daily score correctness fix | 1.5 | none |
| 3 | `/api/capture` redesign with Undo | 3 | 1 |
| 4 | `/api/chat` hardening | 1 | 2, 3 |
| 5 | Start focus block | 1 | 3 (Undo) |
| 6 | Milestone tags and not-built pages for everything else | 0.5 | none |
| | **Total** | **11** | |

At 10 to 15 hours a week that is about three weeks. The ROADMAP dates for
Milestone 1 (October 12) have passed; this plan does not move them, it only
sequences the remaining Milestone 1 work.

**Decisions needed before building.** The open questions at the end of this file
change the design of items 1, 2, 3 and 5. Each has a recommended answer.

---

## 1. Goals and Tasks CRUD pages

**Goal:** Definition of done items 2, 3, 4, 7 and 9: create a goal with domain,
metric, target and deadline; add milestones and tasks under it; complete a task
and see a ledger row; change a target date and see pace change on the next read.

### Design

- **Server components and server actions.** Forms post to server actions; no
  client state holds data, so a hard refresh loses nothing (DoD 9).
- **Validation with Zod, one schema per entity.** Schemas are `.strict()`, so
  `current_value`, `progress_percentage` or any derived field is rejected at the
  boundary (invariant 1). Mirrors the DB checks: `target_date >= start_date`,
  priority 1 to 5, `target_value > 0` for count and value goals.
- **No hard deletes.** Deleting user data is permission level 4. Goals move to
  `paused`, `completed` or `abandoned`; tasks move to `cancelled`.
- **Completing a task** goes through one writer, `completeTask`, used here and
  by capture in item 3. It closes the task only if it is still open, then
  appends a `task_completed` row. Reopening a task is item 3's compensating
  event, so it is not built here.
- **Goal detail page** shows the engine's progress and pace, its milestones
  (add, rename, mark complete), and its tasks.
- **Dashboard links:** goal cards go to `/goals/[id]`, Priority rows to
  `/tasks/[id]`, "Add one" and the "Add a task" quick command to `/tasks/new`.
- **Demo mode:** pages render read-only from the fixture with forms disabled
  and a "connect Supabase to edit" note.

### Files

| New | Purpose |
|---|---|
| `lib/validation/goal.ts`, `task.ts`, `milestone.ts` | Zod schemas and form-to-row mappers |
| `lib/db/goals.ts`, `tasks.ts`, `milestones.ts`, `domains.ts` | All Supabase access for these pages |
| `app/goals/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `actions.ts` | Goal list, create, detail and edit |
| `app/tasks/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `actions.ts` | Task list (open, due today, done), create, edit, complete |
| `components/forms/GoalForm.tsx`, `TaskForm.tsx`, `MilestoneForm.tsx` | Shared forms |

| Changed | Why |
|---|---|
| `components/dashboard/panels.tsx` | Link goal cards, Priority rows, quick command |
| `lib/db/capture.ts` | Task-closing code moves into `lib/db/tasks.ts` as `completeTask` |

### Tests that prove it

- `tests/validation.test.ts`: target date before start date is rejected;
  count goal without a target is rejected; a payload containing `current_value`
  or `pace_status` is rejected; priority 0 and 6 are rejected; `?goal=` prefill
  maps to `goal_id`.
- `tests/task-complete.test.ts`: the pure row builder for a completion writes
  `event_type = task_completed`, copies `goal_id`, `milestone_id`,
  `project_id` and `task_id` from the task, and uses fixed XP. A task already
  done or cancelled produces no row.
- **Manual acceptance against local Supabase** (`supabase start`, seed, sign
  in): DoD items 2, 3, 4, 7 and 9, each written down with what was observed.

### Estimate: 4 evenings

1. Validation schemas, data layer, tests.
2. Goals list, create, edit.
3. Goal detail with milestones and its tasks.
4. Tasks list, create, edit, complete; dashboard links; manual DoD pass.

---

## 2. Daily score correctness fix

**Problem today.** `review_checkin` is a performance component scored `1` or
`0`, never null, so it is always "measurable". Consequences, confirmed by
reading `lib/engine/score.ts` and `tests/score.test.ts`:

- An **empty day scores 0.** The existing test asserts this, under a title that
  says the day should not be punished for lack of data.
- A day where **only the review was done scores 100.**
- With calendar sync not built, schedule adherence is always null, which is
  correct, but nothing tells you the number rests on fewer components.

### Design

- **Five performance components:** priority tasks, goal progress, habits,
  schedule adherence, focus blocks. Review check-in is removed from the score
  and the weight table.
- **Review becomes a consistency indicator,** shown next to the score as
  "Evening review: done" or "not logged". It never changes the number. Note:
  nothing writes `review_completed` until the evening review exists (M2), so
  the indicator will read "not logged" until then.
- **Each component returns a number from 0 to 1, or null.** Null means "nothing
  to measure"; zero means "there was something, and it did not happen". The
  rules for what counts as measurable:

| Component | Measurable when | Zero means |
|---|---|---|
| Priority tasks | At least one task was due today | Due tasks, none done |
| Goal progress | At least one active goal has a deadline (see question 4) | Goals active, none advanced |
| Habits | At least one near-daily habit is active and today is not a rest day | Habit expected, not done |
| Schedule adherence | At least one calendar event was scheduled | Scheduled, none attended |
| Focus blocks | At least one focus session was logged | Never zero; see question 6 |

- **Weight is redistributed only among measurable performance components.**
- **At least two must be measurable to show a number.** Otherwise the card
  shows "Score unavailable" with a coverage readout, "N of 5 components".
  Coverage shows even when a score is shown.
- **`computeDailyScore` returns** `score: number | null`, `coverage: { measured,
  of: 5, components: string[] }`, per-component `raw: number | null`, and a
  separate `consistency: { reviewDone }`.
- **Profile weights are read.** `profiles.prefs.score_weights` is seeded but
  ignored today; the fix reads it, falling back to defaults.
- **Spec change.** ARCHITECTURE.md section 4 lists review check-in at 5% of the
  score. This deliverable changes the spec, so that table is updated in the same
  commit, as CLAUDE.md requires when code and spec would diverge.
- **Not changed here:** `daily_scores.score` is `NOT NULL`. Nothing writes that
  table yet. Before the M2 score rollup stores anything, that column has to
  become nullable (a column change, not a new table).

### Files

| Changed | Why |
|---|---|
| `lib/engine/score.ts`, `lib/engine/types.ts` | Null-aware components, coverage, minimum of two, review split out |
| `lib/dashboard/view-model.ts`, `lib/chat/state.ts` | Pass profile weights; carry `null` and coverage |
| `components/dashboard/Sidebar.tsx`, `app/globals.css` | "Score unavailable", coverage readout, review indicator |
| `lib/ai/context.ts` | Packet says "score unavailable, N of 5 measured" rather than omitting it, so the model cannot guess |
| `scripts/seed.ts`, `ARCHITECTURE.md` | Drop `review_checkin` from weights and the spec table |

### Tests that prove it (`tests/score.test.ts`)

| Case | Expected |
|---|---|
| Review-only day | `score` null, coverage 0 of 5, `consistency.reviewDone` true. Not 100 |
| Empty day | `score` null, coverage 0 of 5. Replaces the current test that expects 0 |
| One component (a P1 task due and done) | `score` null, "Score unavailable", coverage 1 of 5 |
| Two components (tasks 1.0, habits 0.5) | `score` 85: (0.35 × 1 + 0.15 × 0.5) / 0.5 |
| No scheduled events | Schedule adherence null, and the score equals the same day with the schedule input removed. Contrast case: 2 scheduled, 0 attended lowers the score |
| All components | 5 of 5, equals the hand-computed weighted sum, and is identical with the review done or not |

Plus: rest day keeps habits and focus null; custom weights from the profile are
used; `dashboard.test.ts` shows "unavailable" for a day with one component.

### Estimate: 1.5 evenings

---

## 3. `/api/capture` redesign

**Problem today.** The current capture matches by title, not by id; gives the
model every open task; lets the model extract non-task events and quantities;
and has no Undo.

### Design

1. **Normalize** the text: Unicode NFKC, lower case, strip punctuation except
   digits, collapse whitespace, drop filler words ("i", "just", "finally"), and
   detect a completion verb.
2. **Retrieve candidates deterministically.** Pure fuzzy match over the user's
   open tasks (todo, in progress, blocked): share of each title's identifying
   words present in the text, with per-word typo tolerance from a character
   bigram similarity. Keep up to 5 above a floor, ranked by score. No embeddings.
3. **Zero candidates:** reply `no_match` with no model call. Offer "Add it as a
   task?", linking to `/tasks/new?title=…`.
4. **Model selects from the short list only.** Luna sees the candidates as short
   references (`c1` to `c5`), never database ids, and returns JSON:
   `{ decision: "match" | "no_match" | "ambiguous", ref, question }`. Zod-parsed.
   A `ref` outside the list is treated as `no_match`. Through `withCostTracking`
   like every call.
5. **Validate before any write.** The chosen id is re-read from the database with
   `user_id = auth.uid()` and an open status. A missing, foreign or closed task
   becomes `no_match`.
6. **Ambiguous:** one short question, "Did you mean A or B?", with the top two or
   three candidates as buttons in the Ask bar. A button posts `{ task_id }` to
   `/api/capture`, which skips the model and goes straight to step 5.
7. **Matched:** `completeTask` from item 1 closes the task and writes the ledger
   row; an `audit_log` row stores `undo_payload: { task_id, prior_status,
   event_id }`. The reply is **"Marked X complete"** with an Undo button that
   counts down 30 seconds.
8. **Undo writes a compensating event, never a delete.** `POST
   /api/capture/undo { audit_id }` checks the audit row belongs to the user, is
   within the window, and has not been undone. It then appends a
   `task_completion_reversed` row with negated quantity and XP and
   `meta.reverses_event_id`, restores the task's prior status from
   `undo_payload` (only if the task is still done), and writes an
   `undo_capture` audit row so a second Undo is refused.
9. **The engine respects reversals.** A new pure helper drops a reversed
   completion and its reversal when counting completions today, streak days and
   score inputs. Sums (goal value, XP) net out naturally from the negated row.

Server-side the Undo window is 35 seconds from the audit row's timestamp, so
network latency never makes a visible Undo button fail.

### Files

| New | Purpose |
|---|---|
| `lib/capture/normalize.ts`, `candidates.ts` | Pure normalization and fuzzy retrieval |
| `lib/capture/plan.ts` | Orchestration with an injected `Llm`; replaces `lib/chat/capture.ts` |
| `lib/engine/ledger.ts` | Reversal-aware event helpers |
| `app/api/capture/undo/route.ts` | Undo endpoint |

| Changed | Why |
|---|---|
| `lib/ai/prompts.ts` | `CAPTURE_SELECT_PROMPT` replaces `CAPTURE_PROMPT` |
| `lib/db/capture.ts` | `validateOpenTask`, audit write, `undoCapture` |
| `app/api/capture/route.ts` | Accept `{ text }` or `{ task_id }`; return the undo handle |
| `lib/engine/score.ts`, `lib/chat/state.ts`, `lib/dashboard/view-model.ts` | Use the reversal-aware helper |
| `components/dashboard/AskBar.tsx` | Undo countdown, candidate buttons |
| `components/dashboard/panels.tsx` | "Log progress" quick command focuses the Ask bar |
| `app/tasks/[id]/page.tsx` | "Reopen" on a done task uses the same compensating event |

### Tests that prove it

- `tests/capture-normalize.test.ts`: punctuation, case, filler words, Unicode,
  completion-verb detection.
- `tests/capture-candidates.test.ts`: "I finished the auth flow" ranks "Build the
  auth flow" first; a typo ("auht flow") still matches; "problem set 3" does not
  match "problem set 4"; done and cancelled tasks never appear; no candidates
  means an empty list; at most 5 returned.
- `tests/capture-plan.test.ts`, with a stand-in model: zero candidates never
  calls the model; a `ref` outside the list becomes `no_match`; `ambiguous`
  yields one question with at most three options; `{ task_id }` skips the
  model; the budget gate refusing yields a clear reply.
- `tests/ledger.test.ts`: a completion plus its reversal counts as no completion
  today, adds no streak day, nets XP to zero; a reversal of an unknown event is
  ignored; a second reversal of the same event is ignored.
- `tests/undo-window.test.ts`: pure `undoAllowed(createdAt, now, alreadyUndone)`
  at 0, 30, 35 and 35.1 seconds, and when already undone.
- **Manual acceptance against local Supabase:** DoD 5 ("I finished the auth
  flow" closes the task and replies under three seconds), then Undo, then
  confirm the ledger holds both rows and the task is open again.

### Estimate: 3 evenings

1. Normalize, candidates, ledger helper, tests.
2. Model selection, id validation, writes, Undo endpoint, tests.
3. Ask bar Undo and candidate buttons, Reopen on the task page, manual pass.

---

## 4. `/api/chat`

**State today.** `status_query` already answers from the engine alone at
hard_stop, with no model configured, or when the model call fails, and a test
fails if the model is reached. This item keeps that guarantee while items 2 and
3 change what chat depends on.

### Design

- **Widen the status rules.** At hard_stop no model can classify, so a status
  question the status rule misses ends up "budget blocked" instead of getting
  the engine answer. "Where are we at with goals?" is one such miss today: it
  routes to `simple_question`, which needs a model. The rule set is extended and
  covered by a phrasing table.
- **`progress_report` uses the item 3 capture,** and the chat response carries
  the Undo handle and candidate buttons so the Ask bar behaves the same as
  `/api/capture`.
- **Score in context** shows "unavailable, N of 5 measured" (item 2) rather than
  a number the model might restate wrongly.
- **One real-key pass.** DoD 5, 6 and 8 have only run against a stand-in model.
  Run them once with a real OpenAI key and Supabase project, including one
  forced failure to confirm it writes an `ok = false` row.

### Files

`lib/ai/router.ts`, `lib/chat/chat.ts`, `lib/ai/context.ts`,
`components/dashboard/AskBar.tsx`, `tests/router.test.ts`, `tests/chat.test.ts`.

### Tests that prove it

- `tests/chat.test.ts` keeps the hard_stop cases and adds: hard_stop with a
  model that throws if called, over **ten status phrasings**, each returning the
  engine answer that names every active goal and the furthest behind.
- `tests/router.test.ts`: the same ten phrasings route to `status_query` by rules.
- `tests/chat.test.ts`: `progress_report` returns the capture's Undo handle.
- **Manual:** the real-key pass above, with the `model_runs` rows listed.

### Estimate: 1 evening (half code, half the real-key pass)

---

## 5. Start focus block

**Goal:** the sidebar button and the quick command each write exactly one
`focus_session` event.

### Design

- **The event is written when the block starts,** with `meta.minutes` set to
  the chosen length (25, 50 or 90; default 50) and `meta.started_at`. Writing at
  start means no timer lives in React state, so a refresh loses nothing (DoD 9).
  See question 6 for the alternative.
- **Duplicates are impossible.** The client sends a fresh id per click; it
  becomes `external_ref = focus:<id>`, and the existing unique index on
  `(source, external_ref)` rejects a double submit. The server treats that
  conflict as success.
- **Undo for 30 seconds** using item 3's compensating event, for a mis-click.
- **Score:** the focus component already reads `meta.minutes`; one 50-minute
  block measures as 50 of 120 minutes.

### Files

| New | Purpose |
|---|---|
| `lib/focus.ts` | Pure event-row builder and minute validation |
| `app/focus/actions.ts` | `startFocusBlock` server action |
| `components/dashboard/FocusButton.tsx` | Client button with length picker, pending state and Undo |

| Changed | Why |
|---|---|
| `components/dashboard/Sidebar.tsx`, `panels.tsx` | Use `FocusButton`; fix the wrong tooltip |

### Tests that prove it (`tests/focus.test.ts`)

- The row is `focus_session`, quantity 1, fixed XP, `meta.minutes` as chosen,
  and `external_ref` derived from the click id.
- Minutes outside 5 to 180 are rejected.
- The duplicate-key error maps to success.
- `computeDailyScore` with one 50-minute session gives the focus component
  50 / 120.
- **Manual:** click, refresh, confirm one ledger row and the focus component on
  the score card.

### Estimate: 1 evening

---

## 6. Everything else: milestone tags and not-built pages

**Goal:** every control that is not one of the five deliverables says which
milestone it belongs to, and every unbuilt route explains itself instead of
claiming to be on the Milestone 1 build order.

### Design

- **One `NotBuilt` page component** with the milestone tag, one sentence on
  what the page will do, and a link back.
- **Pages:** `/timeline` (M2), `/calendar` (M2), `/jobs` (M3), `/budget` (M3),
  `/activity`, `/projects`, `/memory` (Unscheduled).
- **Sidebar:** each of those links shows its tag, the way Voice shows "DEC 7".
- **Dashboard:** quick command tags change from build steps to milestones;
  Morning brief becomes a real disabled button with an M2 tag; search and the
  bell get an "Unscheduled" tag and stop pretending to be interactive.
- **`not-found.tsx`** becomes a plain 404 for paths that are not planned at all.

### Files

New: `components/ui/NotBuilt.tsx`, seven `app/<route>/page.tsx` files.
Changed: `components/dashboard/Sidebar.tsx`, `panels.tsx`, `TopBar.tsx`,
`Footer.tsx`, `app/not-found.tsx`.

### Test that proves it

`tests/routes.test.ts`: every sidebar and dashboard `href` resolves to an
`app/**/page.tsx` file, and every nav item without a built page carries a
milestone tag. Pure file-system check.

### Estimate: 0.5 evening

Independent of the others; it can go first if you want the app to stop showing
misleading pages sooner.

---

## Open questions

Each changes a design above. Recommended answer first.

1. **Completing a task never moves goal progress.** `task_completed` rows carry
   quantity 0 (seed and current code), so DoD 4 ("goal progress recalculates")
   is only true in the sense that the engine re-reads. Count goals
   (applications, workouts) have no way to advance once item 3 narrows capture
   to tasks.
   **Recommend:** add a deterministic "Log progress" form on the goal detail page
   in item 1 (quantity typed by you, appended to the ledger, no model). Keep task
   completion at quantity 0. Alternative: give completions a quantity, which
   needs a rule for how much each task is worth.
2. **Skip the model when the match is certain?** The spec says the model selects
   from the short list. When exactly one candidate matches every identifying
   word, the text has a completion verb, and the runner-up is far behind,
   deterministic code already knows the answer (invariant 4, check 1).
   **Recommend:** keep that free path; the model handles everything else.
3. **Non-task capture.** Today capture also logs "applied to 4 jobs" through
   model extraction. The new design covers tasks only.
   **Recommend:** drop it from `/api/capture` in V1 and use question 1's goal
   page form instead. That path is where a model came closest to putting a
   number in the ledger.
4. **When is goal progress measurable for the score?** Today it is measurable
   whenever any event happened, so logging one habit makes goal progress read 0.
   **Recommend:** measurable when at least one active goal has a deadline.
5. **Priority tasks with nothing due but something done.** Today that scores
   full marks (1.0), which inflates a light day.
   **Recommend:** null (not measurable); the completion still counts under goal
   progress and XP.
6. **Focus block: record at start or at end?** At end gives true minutes but
   needs a timer that survives refresh, which means client storage or a second
   write.
   **Recommend:** at start with the planned length, plus Undo.
7. **Sign out.** No control exists anywhere.
   **Recommend:** add it to item 1, about 20 minutes.
