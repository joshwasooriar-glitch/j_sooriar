-- Ledger write functions.
--
-- Every write that capture, the task pages, the focus block and the Activity
-- Ledger make goes through one of these. No new tables.
--
-- Shared properties, all four functions:
--   * SECURITY INVOKER: they run as the signed-in user, so RLS still applies.
--   * Ownership is also checked explicitly against auth.uid(). RLS on
--     activity_events only checks user_id, and a foreign key does not check
--     who owns the goal or task it points at, so the explicit check matters.
--   * set search_path = '' and every name schema-qualified, so no object in
--     another schema can shadow what these functions call.
--   * Each call is one transaction: all of it happens or none of it does.
--
-- Errors use custom SQLSTATEs so the app can map them without parsing text:
--   JV401 not signed in       JV404 not found or not yours
--   JV409 already done/used   JV410 undo window expired
--   JV422 invalid input

-- ------------------------------------------------------------------
-- complete_task
-- Closes an open task and appends task_completed. Stores the task's prior
-- status in audit_log.undo_payload so a reversal can restore it exactly.
-- task_completed quantity is 0 by design: completing a task does not move a
-- goal's number.
-- ------------------------------------------------------------------
create or replace function public.complete_task(
  p_task_id uuid,
  p_via     text default 'manual',
  p_text    text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_task     public.tasks%rowtype;
  v_event_id bigint;
  v_at       timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'JV401';
  end if;

  select * into v_task
    from public.tasks
   where id = p_task_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'task not found' using errcode = 'JV404';
  end if;
  if v_task.status not in ('todo', 'in_progress', 'blocked') then
    raise exception 'task is already %', v_task.status using errcode = 'JV409';
  end if;

  update public.tasks
     set status = 'done', completed_at = now()
   where id = p_task_id;

  insert into public.activity_events
    (user_id, event_type, goal_id, milestone_id, project_id, task_id, quantity, xp, source, meta)
  values
    (v_uid, 'task_completed', v_task.goal_id, v_task.milestone_id, v_task.project_id, v_task.id,
     0, 10, 'manual',
     jsonb_build_object('title', v_task.title, 'via', coalesce(p_via, 'manual'), 'text', p_text))
  returning id, created_at into v_event_id, v_at;

  insert into public.audit_log
    (user_id, action, reason, tool, target_table, target_id, permission_level, result, undo_payload)
  values
    (v_uid, 'complete_task', coalesce(p_via, 'manual'), 'complete_task', 'tasks', p_task_id::text, 1, 'success',
     jsonb_build_object(
       'event_id', v_event_id,
       'task_id', p_task_id,
       'prior_status', v_task.status,
       'prior_completed_at', v_task.completed_at));

  return jsonb_build_object(
    'event_id', v_event_id,
    'task_id', p_task_id,
    'title', v_task.title,
    'created_at', v_at);
end;
$$;

-- ------------------------------------------------------------------
-- reverse_activity_event
-- The ONE way to undo anything in the ledger. Appends a compensating
-- 'reversal' row with negated quantity and XP; never deletes or updates the
-- original. If the original completed a task, the task's prior status is
-- restored from audit_log.undo_payload.
--
-- p_max_age_seconds: the Undo toast passes 30 (checked against the database
-- clock, so the browser cannot extend it). The Activity Ledger passes null:
-- no time limit. Same function, same compensating row.
--
-- Single use: the reversal stores the original id in external_ref with
-- source 'reversal', and the existing unique index on (source, external_ref)
-- rejects a second reversal of the same event, even under concurrency.
-- ------------------------------------------------------------------
create or replace function public.reverse_activity_event(
  p_event_id        bigint,
  p_max_age_seconds integer default null,
  p_reason          text    default 'undo'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_ev          public.activity_events%rowtype;
  v_reversal_id bigint;
  v_prior       text;
  v_restored    text := null;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'JV401';
  end if;
  if p_max_age_seconds is not null and p_max_age_seconds <= 0 then
    raise exception 'max age must be positive' using errcode = 'JV422';
  end if;

  -- Row lock serializes concurrent reversals of the same event. A SELECT
  -- FOR UPDATE does not fire the append-only UPDATE trigger.
  select * into v_ev
    from public.activity_events
   where id = p_event_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'event not found' using errcode = 'JV404';
  end if;
  if v_ev.event_type = 'reversal' then
    raise exception 'a reversal cannot itself be reversed' using errcode = 'JV422';
  end if;
  if p_max_age_seconds is not null
     and now() - v_ev.created_at > make_interval(secs => p_max_age_seconds) then
    raise exception 'undo window of % seconds has passed', p_max_age_seconds using errcode = 'JV410';
  end if;

  begin
    insert into public.activity_events
      (user_id, event_type, goal_id, milestone_id, project_id, task_id,
       quantity, xp, source, external_ref, meta)
    values
      (v_uid, 'reversal', v_ev.goal_id, v_ev.milestone_id, v_ev.project_id, v_ev.task_id,
       -v_ev.quantity, -v_ev.xp, 'reversal', v_ev.id::text,
       jsonb_build_object(
         'reverses_event_id', v_ev.id,
         'reverses_event_type', v_ev.event_type,
         'reason', coalesce(p_reason, 'undo')))
    returning id into v_reversal_id;
  exception when unique_violation then
    raise exception 'event % was already reversed', p_event_id using errcode = 'JV409';
  end;

  if v_ev.event_type = 'task_completed' and v_ev.task_id is not null then
    select a.undo_payload ->> 'prior_status' into v_prior
      from public.audit_log a
     where a.user_id = v_uid
       and a.action = 'complete_task'
       and (a.undo_payload ->> 'event_id') = v_ev.id::text
     order by a.id desc
     limit 1;

    -- Restore only if the task is still done; never overwrite a later change.
    update public.tasks
       set status = coalesce(v_prior, 'todo'), completed_at = null
     where id = v_ev.task_id and user_id = v_uid and status = 'done'
    returning status into v_restored;
  end if;

  insert into public.audit_log
    (user_id, action, reason, tool, target_table, target_id, permission_level, result, undo_payload)
  values
    (v_uid, 'reverse_event', coalesce(p_reason, 'undo'), 'reverse_activity_event', 'activity_events',
     p_event_id::text, 1, 'success',
     jsonb_build_object('reversal_event_id', v_reversal_id, 'restored_task_status', v_restored));

  return jsonb_build_object(
    'reversal_event_id', v_reversal_id,
    'reversed_event_id', p_event_id,
    'reversed_event_type', v_ev.event_type,
    'restored_task_status', v_restored);
end;
$$;

-- ------------------------------------------------------------------
-- log_goal_progress
-- Appends progress to a COUNT goal the caller owns. Quantity comes from the
-- user's own confirmed input, never a model. p_ref is a client-generated key:
-- a double submit returns the first event instead of logging twice.
-- ------------------------------------------------------------------
create or replace function public.log_goal_progress(
  p_goal_id  uuid,
  p_quantity numeric,
  p_ref      text,
  p_text     text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_goal     public.goals%rowtype;
  v_event_id bigint;
  v_at       timestamptz;
  v_dup      boolean := false;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'JV401';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000 then
    raise exception 'quantity must be between 0 and 1000' using errcode = 'JV422';
  end if;
  if p_ref is null or length(p_ref) < 8 or length(p_ref) > 100 then
    raise exception 'a request reference is required' using errcode = 'JV422';
  end if;

  select * into v_goal
    from public.goals
   where id = p_goal_id and user_id = v_uid and status = 'active';
  if not found then
    raise exception 'goal not found' using errcode = 'JV404';
  end if;
  if v_goal.metric_type <> 'count' then
    raise exception 'only count goals take logged quantities' using errcode = 'JV422';
  end if;

  begin
    insert into public.activity_events
      (user_id, event_type, goal_id, quantity, xp, source, external_ref, meta)
    values
      (v_uid, 'goal_progress', v_goal.id, p_quantity, 10, 'manual', 'progress:' || p_ref,
       jsonb_build_object('unit', v_goal.unit, 'text', p_text))
    returning id, created_at into v_event_id, v_at;
  exception when unique_violation then
    select id, created_at into v_event_id, v_at
      from public.activity_events
     where source = 'manual' and external_ref = 'progress:' || p_ref and user_id = v_uid;
    v_dup := true;
  end;

  return jsonb_build_object(
    'event_id', v_event_id,
    'goal_id', v_goal.id,
    'quantity', p_quantity,
    'created_at', v_at,
    'duplicate', v_dup);
end;
$$;

-- ------------------------------------------------------------------
-- log_focus_session
-- One focus_session row, written when the block is stopped. Elapsed time is
-- measured by the client's monotonic clock and capped here at 4 hours: a
-- longer session means it was left running, so it counts as 240 minutes and
-- is flagged. Under one minute is treated as a mis-click and rejected.
-- ------------------------------------------------------------------
create or replace function public.log_focus_session(
  p_elapsed_ms bigint,
  p_ref        text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_cap_ms   constant bigint := 4 * 60 * 60 * 1000;
  v_ms       bigint;
  v_minutes  integer;
  v_capped   boolean;
  v_event_id bigint;
  v_at       timestamptz;
  v_dup      boolean := false;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'JV401';
  end if;
  if p_elapsed_ms is null or p_elapsed_ms < 60000 then
    raise exception 'a focus block must run at least one minute' using errcode = 'JV422';
  end if;
  if p_ref is null or length(p_ref) < 8 or length(p_ref) > 100 then
    raise exception 'a request reference is required' using errcode = 'JV422';
  end if;

  v_capped  := p_elapsed_ms > v_cap_ms;
  v_ms      := least(p_elapsed_ms, v_cap_ms);
  v_minutes := floor(v_ms / 60000.0)::integer;

  begin
    insert into public.activity_events
      (user_id, event_type, quantity, xp, source, external_ref, meta)
    values
      (v_uid, 'focus_session', 1, 8, 'manual', 'focus:' || p_ref,
       jsonb_build_object('minutes', v_minutes, 'elapsed_ms', v_ms, 'capped', v_capped,
                          'reported_elapsed_ms', p_elapsed_ms))
    returning id, created_at into v_event_id, v_at;
  exception when unique_violation then
    select id, created_at into v_event_id, v_at
      from public.activity_events
     where source = 'manual' and external_ref = 'focus:' || p_ref and user_id = v_uid;
    v_dup := true;
  end;

  return jsonb_build_object(
    'event_id', v_event_id,
    'minutes', v_minutes,
    'capped', v_capped,
    'created_at', v_at,
    'duplicate', v_dup);
end;
$$;

-- Only signed-in users may call these. Never anon, never public.
revoke all on function public.complete_task(uuid, text, text) from public, anon;
revoke all on function public.reverse_activity_event(bigint, integer, text) from public, anon;
revoke all on function public.log_goal_progress(uuid, numeric, text, text) from public, anon;
revoke all on function public.log_focus_session(bigint, text) from public, anon;

grant execute on function public.complete_task(uuid, text, text) to authenticated;
grant execute on function public.reverse_activity_event(bigint, integer, text) to authenticated;
grant execute on function public.log_goal_progress(uuid, numeric, text, text) to authenticated;
grant execute on function public.log_focus_session(bigint, text) to authenticated;
