-- The ledger keeps its references when the things they point at are deleted.
--
-- Bug (production, Nov 11): deleting any task with ledger history failed with
--   ERROR P0001: activity_events is append-only
--   SQL statement: UPDATE ONLY "public"."activity_events" SET "task_id" = NULL ...
-- The foreign keys from activity_events were ON DELETE SET NULL. That cascade
-- is an UPDATE of the ledger, which the append-only trigger rightly rejects.
-- The same was true of goal_id, milestone_id and project_id, and it is also
-- why npm run seed:purge failed: deleting a seed task that a real event
-- pointed at cascaded into the ledger.
--
-- Decision: the ledger row never changes. An event records a fact about a
-- task as it was ("event 87 completed task X"), and that stays true after X
-- is deleted. Nulling the column would rewrite history and lose the link.
-- So the four foreign keys go, the columns and their values stay, and the
-- append-only guard is not loosened in any way.
--
-- What the foreign keys guaranteed at insert time is kept, and tightened, by
-- check_ledger_references: a new event may only reference a task, goal,
-- milestone or project that exists AND belongs to the same user (a foreign key
-- never checked ownership). Reversal rows are exempt, because reversing an
-- event whose task was later deleted must still work: the reversal copies the
-- original's references, dangling or not.
--
-- user_id keeps its foreign key to profiles. No new tables.

alter table public.activity_events drop constraint if exists activity_events_task_id_fkey;
alter table public.activity_events drop constraint if exists activity_events_goal_id_fkey;
alter table public.activity_events drop constraint if exists activity_events_milestone_id_fkey;
alter table public.activity_events drop constraint if exists activity_events_project_id_fkey;

comment on column public.activity_events.task_id is
  'The task this event was about, as it was. Not a foreign key: it survives the task being deleted. Validated at insert by check_ledger_references.';
comment on column public.activity_events.goal_id is
  'Not a foreign key: survives the goal being deleted. Validated at insert by check_ledger_references.';
comment on column public.activity_events.milestone_id is
  'Not a foreign key: survives the milestone being deleted. Validated at insert by check_ledger_references.';
comment on column public.activity_events.project_id is
  'Not a foreign key: survives the project being deleted. Validated at insert by check_ledger_references.';

create or replace function public.check_ledger_references()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A reversal copies the original event's references, which may since have
  -- been deleted. The original was validated when it was written.
  if new.event_type = 'reversal' then
    return new;
  end if;

  if new.task_id is not null and not exists (
    select 1 from public.tasks t where t.id = new.task_id and t.user_id = new.user_id
  ) then
    raise exception 'task % does not exist or is not this user''s', new.task_id using errcode = '23503';
  end if;

  if new.goal_id is not null and not exists (
    select 1 from public.goals g where g.id = new.goal_id and g.user_id = new.user_id
  ) then
    raise exception 'goal % does not exist or is not this user''s', new.goal_id using errcode = '23503';
  end if;

  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id
  ) then
    raise exception 'project % does not exist or is not this user''s', new.project_id using errcode = '23503';
  end if;

  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m join public.goals g on g.id = m.goal_id
     where m.id = new.milestone_id and g.user_id = new.user_id
  ) then
    raise exception 'milestone % does not exist or is not this user''s', new.milestone_id using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.check_ledger_references() from public, anon, authenticated;

drop trigger if exists activity_events_check_references on public.activity_events;
create trigger activity_events_check_references
  before insert on public.activity_events
  for each row execute function public.check_ledger_references();

-- purge_seed_data runs as its owner and disables the ledger guard. It was
-- executable by anon and authenticated, so anyone holding the public anon key
-- could call it for any user id. It is an operator tool: service role only.
revoke all on function public.purge_seed_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_seed_data(uuid) to service_role;
