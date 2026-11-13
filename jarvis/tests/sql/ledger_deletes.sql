-- Deleting things the ledger points at, and the seed purge.
-- Migration: 20261111000000_ledger_keeps_references.sql
--
-- Runs in one transaction that is rolled back. Any failed check raises.

\set ON_ERROR_STOP on
begin;

create function pg_temp.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL %', p_label; end if;
  raise notice 'ok  %', p_label;
end $$;

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

grant execute on all functions in schema pg_temp to authenticated, anon, service_role;

-- ---------------------------------------------------------------- fixtures

insert into auth.users (id, email, aud, role) values
  ('eeeeeeee-0000-0000-0000-000000000005', 'e@test.local', 'authenticated', 'authenticated'),
  ('ffffffff-0000-0000-0000-000000000006', 'f@test.local', 'authenticated', 'authenticated');

insert into public.goals (id, user_id, title, metric_type, target_value, unit, start_date, target_date)
values ('00000000-0000-0000-0000-00000000e001', 'eeeeeeee-0000-0000-0000-000000000005', 'Count goal', 'count', 10, 'sessions', current_date - 5, current_date + 30);
insert into public.milestones (id, goal_id, title) values ('00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000e001', 'M1');
insert into public.projects (id, user_id, name) values ('00000000-0000-0000-0000-00000000e401', 'eeeeeeee-0000-0000-0000-000000000005', 'P1');
insert into public.tasks (id, user_id, goal_id, title, status) values
  ('00000000-0000-0000-0000-00000000e701', 'eeeeeeee-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000e001', 'Has history', 'todo'),
  ('00000000-0000-0000-0000-00000000f701', 'ffffffff-0000-0000-0000-000000000006', null, 'Other user''s task', 'todo');

-- History against the task, the goal, the milestone and the project.
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
create temp table r_done as select public.complete_task('00000000-0000-0000-0000-00000000e701', 'test') as r;
insert into public.activity_events (user_id, event_type, goal_id, milestone_id, project_id, task_id, quantity, xp)
values ('eeeeeeee-0000-0000-0000-000000000005', 'goal_progress', '00000000-0000-0000-0000-00000000e001',
        '00000000-0000-0000-0000-00000000e301', '00000000-0000-0000-0000-00000000e401',
        '00000000-0000-0000-0000-00000000e701', 3, 10);

-- ---------------------------------------------------------------- 2. deleting a task with history

create temp table before_rows as
  select id, event_type, quantity, xp, task_id, goal_id from public.activity_events
   where user_id = 'eeeeeeee-0000-0000-0000-000000000005';

delete from public.tasks where id = '00000000-0000-0000-0000-00000000e701';

select pg_temp.check('deleting a task with ledger events succeeds',
  (select count(*) = 0 from public.tasks where id = '00000000-0000-0000-0000-00000000e701'));
select pg_temp.check('the historical events still exist with their original quantity and xp',
  (select count(*) = 2 and bool_and(a.quantity = b.quantity and a.xp = b.xp)
     from public.activity_events a join before_rows b using (id)));
select pg_temp.check('the events still carry the deleted task''s id: history is not rewritten',
  (select bool_and(task_id = '00000000-0000-0000-0000-00000000e701') from public.activity_events
    where user_id = 'eeeeeeee-0000-0000-0000-000000000005'));

select pg_temp.check('an event whose task was deleted can still be reversed',
  (select public.reverse_activity_event((select (r ->> 'event_id')::bigint from r_done), null, 'ledger')
     ->> 'reversal_event_id' is not null));
select pg_temp.check('reversing it restores no task status, because there is no task',
  (select meta ->> 'reverses_event_type' = 'task_completed' from public.activity_events
    where event_type = 'reversal' and user_id = 'eeeeeeee-0000-0000-0000-000000000005'));

-- The same for the other three references.
delete from public.milestones where id = '00000000-0000-0000-0000-00000000e301';
delete from public.projects where id = '00000000-0000-0000-0000-00000000e401';
delete from public.goals where id = '00000000-0000-0000-0000-00000000e001';
select pg_temp.check('deleting a milestone, project and goal with history succeeds and keeps the quantity',
  (select quantity = 3 and goal_id is not null and milestone_id is not null and project_id is not null
     from public.activity_events where event_type = 'goal_progress' and user_id = 'eeeeeeee-0000-0000-0000-000000000005'));

-- ---------------------------------------------------------------- insert-time integrity

select pg_temp.expect_error('a new event may not reference a task that does not exist',
  $q$ insert into public.activity_events (user_id, event_type, task_id)
      values ('eeeeeeee-0000-0000-0000-000000000005', 'task_completed', '00000000-0000-0000-0000-00000000e701') $q$, '23503');
select pg_temp.expect_error('a new event may not reference another user''s task',
  $q$ insert into public.activity_events (user_id, event_type, task_id)
      values ('eeeeeeee-0000-0000-0000-000000000005', 'task_completed', '00000000-0000-0000-0000-00000000f701') $q$, '23503');
select pg_temp.expect_error('a new event may not reference a goal that does not exist',
  $q$ insert into public.activity_events (user_id, event_type, goal_id)
      values ('eeeeeeee-0000-0000-0000-000000000005', 'goal_progress', '00000000-0000-0000-0000-00000000e001') $q$, '23503');

-- ---------------------------------------------------------------- the guard is not loosened

select pg_temp.expect_error('an ordinary UPDATE of the ledger is still rejected',
  $q$ update public.activity_events set quantity = 99 where user_id = 'eeeeeeee-0000-0000-0000-000000000005' $q$, 'P0001');
select pg_temp.expect_error('nulling task_id by hand is still rejected',
  $q$ update public.activity_events set task_id = null where user_id = 'eeeeeeee-0000-0000-0000-000000000005' $q$, 'P0001');
select pg_temp.expect_error('an ordinary DELETE from the ledger is still rejected',
  $q$ delete from public.activity_events where user_id = 'eeeeeeee-0000-0000-0000-000000000005' $q$, 'P0001');

-- ---------------------------------------------------------------- 3. the seed purge

select pg_temp.as_admin();

-- memories.source_type (migration 20261113000000) is required with no default.
-- Give it one inside this rolled-back transaction, so the fixture below works
-- whether or not that migration is applied yet.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'memories' and column_name = 'source_type') then
    execute 'alter table public.memories alter column source_type set default ''stated''';
  end if;
end $$;

-- The production failure: a REAL event pointing at a SEED task.
insert into public.goals (id, user_id, title, start_date, source)
values ('00000000-0000-0000-0000-00000000f001', 'ffffffff-0000-0000-0000-000000000006', 'Seed goal', current_date, 'seed');
insert into public.tasks (id, user_id, goal_id, title, status, source) values
  ('00000000-0000-0000-0000-00000000f702', 'ffffffff-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000f001', 'Seed task', 'todo', 'seed');
insert into public.habits (user_id, name, source) values ('ffffffff-0000-0000-0000-000000000006', 'Seed habit', 'seed');
insert into public.memories (user_id, kind, content, source) values ('ffffffff-0000-0000-0000-000000000006', 'profile', 'Seed memory', 'seed');
insert into public.activity_events (user_id, event_type, goal_id, task_id, quantity, xp, source) values
  ('ffffffff-0000-0000-0000-000000000006', 'goal_progress', '00000000-0000-0000-0000-00000000f001', null, 5, 10, 'seed'),
  ('ffffffff-0000-0000-0000-000000000006', 'task_completed', '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f702', 0, 10, 'manual');

select set_config('role', 'service_role', true);
create temp table r_purge as select * from public.purge_seed_data('ffffffff-0000-0000-0000-000000000006');
select pg_temp.as_admin();

select pg_temp.check('the purge succeeds even when a real event points at a seed task',
  (select sum(rows_deleted) >= 5 from r_purge));
select pg_temp.check('zero source=seed rows remain, in any table',
  (select (select count(*) from public.activity_events where user_id = 'ffffffff-0000-0000-0000-000000000006' and source = 'seed')
        + (select count(*) from public.tasks where user_id = 'ffffffff-0000-0000-0000-000000000006' and source = 'seed')
        + (select count(*) from public.goals where user_id = 'ffffffff-0000-0000-0000-000000000006' and source = 'seed')
        + (select count(*) from public.habits where user_id = 'ffffffff-0000-0000-0000-000000000006' and source = 'seed')
        + (select count(*) from public.memories where user_id = 'ffffffff-0000-0000-0000-000000000006' and source = 'seed') = 0));
select pg_temp.check('the real event survives the purge, untouched',
  (select count(*) = 1 and min(quantity) = 0 and min(task_id::text) = '00000000-0000-0000-0000-00000000f702'
     from public.activity_events where user_id = 'ffffffff-0000-0000-0000-000000000006' and source = 'manual'));
select pg_temp.check('both ledger guards are enabled again after the purge',
  (select count(*) = 2 and bool_and(tgenabled = 'O') from pg_trigger
    where tgrelid = 'public.activity_events'::regclass and tgname in ('activity_events_no_update', 'activity_events_no_delete')));
select pg_temp.expect_error('after the purge, an ordinary DELETE from the ledger is still rejected',
  $q$ delete from public.activity_events where user_id = 'ffffffff-0000-0000-0000-000000000006' $q$, 'P0001');

select pg_temp.check('purge_seed_data is not callable by anon or signed-in users, only the service role',
  (select not has_function_privilege('anon', 'public.purge_seed_data(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.purge_seed_data(uuid)', 'execute')
      and has_function_privilege('service_role', 'public.purge_seed_data(uuid)', 'execute')));

\echo 'ALL SQL CHECKS PASSED'
rollback;
