-- Tests for supabase/migrations/20261105000000_ledger_functions.sql
--
-- Runs against a real Postgres with the migrations applied:
--   npm run test:sql            (uses DATABASE_URL, default is the local stack)
--
-- Everything happens inside one transaction that is rolled back at the end, so
-- the database is left exactly as it was. Any failed check raises and stops.

\set ON_ERROR_STOP on
\set QUIET on
begin;

-- ---------------------------------------------------------------- helpers

create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Runs p_sql and passes only if it fails with SQLSTATE p_code.
create function pg_temp.expect_error(p_label text, p_sql text, p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL %: expected error %, got success', p_label, p_code;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'FAIL %' then raise; end if;
  if sqlstate <> p_code then
    raise exception 'FAIL %: expected %, got % (%)', p_label, p_code, sqlstate, sqlerrm;
  end if;
  raise notice 'ok  %', p_label;
end $$;

create function pg_temp.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL %', p_label; end if;
  raise notice 'ok  %', p_label;
end $$;

grant execute on all functions in schema pg_temp to authenticated, anon;

-- ---------------------------------------------------------------- fixtures

insert into auth.users (id, email, aud, role)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local', 'authenticated', 'authenticated'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'A'), ('bbbbbbbb-0000-0000-0000-000000000002', 'B')
-- The signup trigger may already have created these.
on conflict (id) do update set display_name = excluded.display_name;

insert into public.goals (id, user_id, title, metric_type, target_value, unit, start_date, target_date)
values ('00000000-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Land a role', 'count', 60, 'applications', current_date - 30, current_date + 100),
       ('00000000-0000-0000-0000-00000000a002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ship JARVIS', 'percent', 100, '%', current_date - 10, current_date + 60),
       ('00000000-0000-0000-0000-00000000b001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B goal', 'count', 10, 'sessions', current_date - 5, current_date + 50);

insert into public.tasks (id, user_id, goal_id, title, status, priority)
values ('00000000-0000-0000-0000-0000000a7001', 'aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a002', 'Build the auth flow', 'in_progress', 1),
       ('00000000-0000-0000-0000-0000000b7001', 'bbbbbbbb-0000-0000-0000-000000000002', null, 'B task', 'todo', 2);

-- ---------------------------------------------------------------- complete_task

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');

create temp table r_complete as
  select public.complete_task('00000000-0000-0000-0000-0000000a7001', 'test', 'finished the auth flow') as r;

select pg_temp.check('complete_task closes the task',
  (select status = 'done' and completed_at is not null from public.tasks where id = '00000000-0000-0000-0000-0000000a7001'));
select pg_temp.check('complete_task writes one task_completed row with quantity 0',
  (select count(*) = 1 and min(quantity) = 0 and min(xp) = 10
     from public.activity_events where task_id = '00000000-0000-0000-0000-0000000a7001' and event_type = 'task_completed'));
select pg_temp.check('complete_task stores the prior status in audit_log.undo_payload',
  (select undo_payload ->> 'prior_status' = 'in_progress'
     from public.audit_log where action = 'complete_task' and target_id = '00000000-0000-0000-0000-0000000a7001'));
select pg_temp.expect_error('complete_task twice is refused',
  $q$ select public.complete_task('00000000-0000-0000-0000-0000000a7001') $q$, 'JV409');
select pg_temp.expect_error('complete_task on another user''s task is not found',
  $q$ select public.complete_task('00000000-0000-0000-0000-0000000b7001') $q$, 'JV404');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check('the other user''s task is untouched',
  (select status = 'todo' from public.tasks where id = '00000000-0000-0000-0000-0000000b7001'));

-- ---------------------------------------------------------------- reverse (Undo toast, 30 s)

select pg_temp.expect_error('another user cannot reverse A''s event',
  format($q$ select public.reverse_activity_event(%s, 30) $q$, (select (r ->> 'event_id') from r_complete)), 'JV404');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
create temp table r_undo as
  select public.reverse_activity_event((select (r ->> 'event_id')::bigint from r_complete), 30, 'undo') as r;

select pg_temp.check('undo writes a compensating reversal row, negated, pointing at the original',
  (select count(*) = 1 and min(quantity) = 0 and min(xp) = -10 and min(source) = 'reversal'
          and min(external_ref) = (select r ->> 'event_id' from r_complete)
          and min(meta ->> 'reverses_event_type') = 'task_completed'
     from public.activity_events where event_type = 'reversal'));
select pg_temp.check('undo restores the task''s prior status from undo_payload',
  (select status = 'in_progress' and completed_at is null from public.tasks where id = '00000000-0000-0000-0000-0000000a7001')
  and (select r ->> 'restored_task_status' = 'in_progress' from r_undo));
select pg_temp.check('the original task_completed row still exists: nothing was deleted',
  (select count(*) = 1 from public.activity_events where id = (select (r ->> 'event_id')::bigint from r_complete)));
select pg_temp.expect_error('undo is single use',
  format($q$ select public.reverse_activity_event(%s, 30) $q$, (select r ->> 'event_id' from r_complete)), 'JV409');
select pg_temp.expect_error('the Activity Ledger cannot reverse it a second time either',
  format($q$ select public.reverse_activity_event(%s, null) $q$, (select r ->> 'event_id' from r_complete)), 'JV409');
select pg_temp.expect_error('a reversal cannot itself be reversed',
  format($q$ select public.reverse_activity_event(%s, null) $q$, (select r ->> 'reversal_event_id' from r_undo)), 'JV422');
select pg_temp.check('an audit row records the reversal',
  (select count(*) = 1 from public.audit_log where action = 'reverse_event'));

-- The task can be completed again after an undo.
select pg_temp.check('a reopened task can be completed again',
  (select public.complete_task('00000000-0000-0000-0000-0000000a7001') ->> 'event_id' is not null));

-- ---------------------------------------------------------------- expiry vs the ledger page

-- An event created 31 seconds ago. created_at is set at insert time; the
-- append-only trigger means it could never be edited afterwards.
insert into public.activity_events (user_id, event_type, goal_id, quantity, xp, created_at, occurred_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'goal_progress', '00000000-0000-0000-0000-00000000a001', 3, 10,
        now() - interval '31 seconds', now() - interval '31 seconds');
create temp table r_old as select max(id) as id from public.activity_events where quantity = 3;

select pg_temp.expect_error('the toast undo is refused after 30 seconds, by the database clock',
  format($q$ select public.reverse_activity_event(%s, 30) $q$, (select id from r_old)), 'JV410');
select pg_temp.check('the Activity Ledger reverse has no time limit and uses the same function',
  (select public.reverse_activity_event((select id from r_old), null, 'ledger') ->> 'reversal_event_id' is not null));
select pg_temp.check('a reversed quantity nets to zero in the goal sum',
  (select coalesce(sum(quantity), 0) = 0 from public.activity_events
     where goal_id = '00000000-0000-0000-0000-00000000a001'));

-- ---------------------------------------------------------------- log_goal_progress

create temp table r_log as
  select public.log_goal_progress('00000000-0000-0000-0000-00000000a001', 4, 'ref-aaaa-0001', '4 applications') as r;
create temp table r_log2 as
  select public.log_goal_progress('00000000-0000-0000-0000-00000000a001', 4, 'ref-aaaa-0001', '4 applications') as r;

select pg_temp.check('log_goal_progress writes the confirmed quantity',
  (select (r ->> 'quantity')::numeric = 4 from r_log));
select pg_temp.check('a double submit with the same ref logs once and returns the same event',
  (select (a.r ->> 'event_id') = (b.r ->> 'event_id') and (b.r ->> 'duplicate')::boolean from r_log a, r_log2 b)
  and (select count(*) = 1 from public.activity_events where external_ref = 'progress:ref-aaaa-0001'));
select pg_temp.expect_error('log_goal_progress refuses a percent goal',
  $q$ select public.log_goal_progress('00000000-0000-0000-0000-00000000a002', 4, 'ref-aaaa-0002') $q$, 'JV422');
select pg_temp.expect_error('log_goal_progress refuses another user''s goal',
  $q$ select public.log_goal_progress('00000000-0000-0000-0000-00000000b001', 4, 'ref-aaaa-0003') $q$, 'JV404');
select pg_temp.expect_error('log_goal_progress refuses zero',
  $q$ select public.log_goal_progress('00000000-0000-0000-0000-00000000a001', 0, 'ref-aaaa-0004') $q$, 'JV422');
select pg_temp.expect_error('log_goal_progress refuses a year-sized number',
  $q$ select public.log_goal_progress('00000000-0000-0000-0000-00000000a001', 2026, 'ref-aaaa-0005') $q$, 'JV422');

-- ---------------------------------------------------------------- log_focus_session

create temp table r_focus as select public.log_focus_session(5 * 60 * 60 * 1000, 'focus-ref-0001') as r;
select pg_temp.check('a 5 hour session is capped at 240 minutes and flagged',
  (select (r ->> 'minutes')::int = 240 and (r ->> 'capped')::boolean from r_focus));
select pg_temp.check('a 50 minute session records 50 minutes, uncapped',
  (select (r ->> 'minutes')::int = 50 and not (r ->> 'capped')::boolean
     from (select public.log_focus_session(50 * 60 * 1000 + 999, 'focus-ref-0002') as r) x));
select pg_temp.check('a repeated stop with the same ref writes one row',
  (select public.log_focus_session(5 * 60 * 60 * 1000, 'focus-ref-0001') ->> 'duplicate' = 'true')
  and (select count(*) = 1 from public.activity_events where external_ref = 'focus:focus-ref-0001'));
select pg_temp.expect_error('a session under one minute is refused',
  $q$ select public.log_focus_session(30000, 'focus-ref-0003') $q$, 'JV422');

-- ---------------------------------------------------------------- access control

select pg_temp.as_admin();
select pg_temp.check('every function sets an explicit, empty search_path',
  (select bool_and(coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%')
     from pg_proc where proname in ('complete_task', 'reverse_activity_event', 'log_goal_progress', 'log_focus_session')));
select pg_temp.check('every function runs as the caller, not as the owner',
  (select bool_and(not prosecdef) from pg_proc
     where proname in ('complete_task', 'reverse_activity_event', 'log_goal_progress', 'log_focus_session')));

select set_config('role', 'anon', true);
select pg_temp.expect_error('anon cannot execute complete_task',
  $q$ select public.complete_task('00000000-0000-0000-0000-0000000a7001') $q$, '42501');
select pg_temp.expect_error('anon cannot execute reverse_activity_event',
  $q$ select public.reverse_activity_event(1, null) $q$, '42501');

select pg_temp.as_user(null);
select pg_temp.expect_error('a signed-out caller is refused',
  $q$ select public.log_focus_session(120000, 'focus-ref-0009') $q$, 'JV401');

select pg_temp.as_admin();
\echo 'ALL SQL CHECKS PASSED'
rollback;
