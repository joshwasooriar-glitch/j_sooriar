-- JARVIS scheduled jobs
--
-- Milestone 1 needs only the nightly reconcile. The rest are defined here so the
-- schedule is version-controlled, but they are created commented out and should
-- be enabled in Milestone 2 when their endpoints exist.
--
-- Times are UTC. America/New_York is UTC-4 in EDT and UTC-5 in EST, so these
-- shift by an hour across the DST boundary on November 1, 2026. The handler
-- re-checks local time against profiles.timezone and no-ops if it is wrong.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Set these once per environment:
--   alter database postgres set app.jarvis_base_url = 'https://jarvis.vercel.app';
--   alter database postgres set app.cron_secret     = '<CRON_SECRET>';

create or replace function jarvis_call(endpoint text, payload jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  req_id bigint;
begin
  select net.http_post(
    url     := current_setting('app.jarvis_base_url') || endpoint,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.cron_secret')),
    body    := payload,
    timeout_milliseconds := 30000
  ) into req_id;
  return req_id;
end;
$$;

-- ---------- Milestone 1: active now ----------

-- Nightly reconcile at 03:00 ET (07:00 UTC during EDT).
-- Rebuilds every goal's current_value cache from the ledger.
select cron.schedule(
  'jarvis-reconcile',
  '0 7 * * *',
  $$
  select reconcile_goal_values(id) from profiles;
  $$
);

-- ---------- Milestone 2 and 3: enable when the endpoints exist ----------

-- Morning brief, 05:30 ET
-- select cron.schedule('jarvis-morning-brief', '30 9 * * *',
--   $$ select jarvis_call('/api/cron/morning-brief'); $$);

-- Evening review, 21:00 ET
-- select cron.schedule('jarvis-evening-review', '0 1 * * *',
--   $$ select jarvis_call('/api/cron/evening-review'); $$);

-- Monday launch, 06:00 ET Monday
-- select cron.schedule('jarvis-weekly-launch', '0 10 * * 1',
--   $$ select jarvis_call('/api/cron/weekly-launch'); $$);

-- Job worker, every 5 minutes
-- select cron.schedule('jarvis-job-worker', '*/5 * * * *',
--   $$ select jarvis_call('/api/cron/job-worker'); $$);

-- Daily score rollup, 00:10 ET
-- select cron.schedule('jarvis-score-rollup', '10 4 * * *',
--   $$ select jarvis_call('/api/cron/score-rollup'); $$);

-- Inspect:   select * from cron.job;
-- History:   select * from cron.job_run_details order by start_time desc limit 20;
-- Remove:    select cron.unschedule('jarvis-reconcile');
