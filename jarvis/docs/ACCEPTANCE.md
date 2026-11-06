# Acceptance

Real-service acceptance is required before any merge to `main`. It runs the app
against real Supabase services with a real login, and records evidence from the
database, not from what the UI says.

## Steps

1. Sign in with a magic link.
2. Create a goal.
3. Create a task.
4. Complete it.
5. Verify the ledger row.
6. Undo it.
7. Verify the compensating row and the restored task status.
8. Log count progress.
9. Run a focus block.
10. Sign out.

The local run also checks that the dashboard reads **AI OFF**, that Undo is
refused after 30 seconds, and that the Activity Ledger reverse has no time limit.

---

## Run 1: local Supabase stack, November 5, 2026

**Result: all 10 steps passed.** Full log, with the magic-link token redacted:
[`acceptance/2026-11-05-local-supabase.txt`](acceptance/2026-11-05-local-supabase.txt).

**Environment:** `npx supabase start`. This is the real Supabase software,
running locally: GoTrue auth, PostgREST, Postgres with every migration in
`supabase/migrations/` applied, and Inbucket catching the magic-link email.
The app was a production build (`next build`, `next start`) with
`JARVIS_AI_ENABLED=false`. A real Chromium browser drove it through
`scripts/acceptance-local.mjs`, which queries Postgres after every step.

**Evidence highlights, as recorded:**

| Step | Database evidence |
|---|---|
| Sign in | Session cookie set. `profiles` row created by the signup trigger, timezone `America/New_York` |
| Create goal | `goals`: count, target 60, unit applications, `current_value` 0 (cache only) |
| Complete by capture | "Marked "Build the auth flow" complete." in 237 ms. `task_completed`, quantity 0, xp 10, via `capture:confident`. Task `done`. `audit_log.undo_payload.prior_status = todo` |
| Undo, under 30 s | `reversal` row: quantity 0, xp -10, `external_ref` = the original id. The original row is still there. Task back to `todo`, `completed_at` null |
| Undo, after 31 s | HTTP 410, `JV410`. Activity Ledger reverse then succeeded: 2 completions, 2 reversals, 0 deletions |
| Count progress | Confirmation showed "Land a SWE or data role +3 applications · 0 → 3 of 60 (5%)" with nothing written yet. Then `goal_progress` quantity 3, idempotency ref set; ledger value 3 |
| Focus block | Nothing written on Start. Stop after 62 s: one `focus_session`, 1 minute, `elapsed_ms` 62,091, not capped |
| Sign out | `/` redirects to `/login`; 0 session cookies left |
| AI off | `model_runs` rows for the user: **0** |

**Bugs this run found, both fixed before the passing run:**

1. **New users had no profile row,** so a brand-new account could not create a
   goal. Fixed by migration `20261105000100_profile_on_signup.sql`.
2. **The magic-link callback redirected to a different host** (`localhost`
   instead of `127.0.0.1`). The session cookie was set for the browser's host,
   so the user landed back on the login page. Fixed in `lib/http/origin.ts`,
   which now builds the redirect from the host the browser sent.

## Run 2: hosted Supabase project, November 6, 2026

**Result: all 10 steps passed.** Run by Joshwa against the linked hosted
project (all migrations applied, real auth, seeded), with evidence taken from
the database:

- `task_completed` written on completion.
- Undo wrote the compensating row with xp -10, and the task status was
  restored to `todo`.
- `goal_progress` with quantity 3 after the confirmed count capture.
- One `focus_session` written on Stop.
- 0 model calls (`JARVIS_AI_ENABLED` off).
- Five completions were five distinct tasks, with no duplicate rows.

Two bugs found while setting up the hosted project, both fixed before this run:
the seed's batch inserts sent NULL over NOT NULL column defaults, and `npm run
seed` did not load `.env.local`. One more was found during the run itself: count
capture matched only the goal's unit ("did 3 affirmations" missed a goal whose
unit was "times said"). It now also matches title words.

## Repeating the hosted run

To repeat it against a hosted project:

1. Apply migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
2. In Supabase Auth settings, add your deployed URL (or `http://localhost:3000`)
   to the redirect URLs.
3. Set `.env.local` to the project's URL and anon key, with
   `JARVIS_AI_ENABLED=false`. Then run `npm run build && npm start`.
4. Create your account once. Sign-up is off in the app (`shouldCreateUser: false`),
   so either invite yourself from the Supabase dashboard or create the user under
   Authentication.
5. Walk the 10 steps in the browser. After each one, run the matching query in
   the Supabase SQL editor and save the output:

```sql
-- after completing, undoing and reversing a task
select id, event_type, quantity, xp, source, meta->>'reverses_event_id' as reverses
from activity_events where task_id = '<task id>' order by id;
select status, completed_at from tasks where id = '<task id>';
select action, undo_payload from audit_log where target_id = '<task id>' order by id;

-- after logging count progress
select id, event_type, quantity, external_ref from activity_events
where goal_id = '<goal id>' and event_type = 'goal_progress';

-- after the focus block
select id, meta from activity_events where event_type = 'focus_session' order by id desc limit 1;

-- AI off: expect 0
select count(*) from model_runs;
```

The local run can be repeated at any time:

```bash
npx supabase start
npm run test:sql                       # 37 database checks
npm run build && npx next start -p 3100 -H 127.0.0.1 &
SUPABASE_SERVICE_ROLE_KEY=<local service key from `npx supabase status`> node scripts/acceptance-local.mjs
```
