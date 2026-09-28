-- Seed purge.
--
-- activity_events carries an append-only trigger, so seed rows cannot be
-- deleted by ordinary client code. That is deliberate. This function is the one
-- sanctioned exception: it disables the guard, removes only rows marked
-- source='seed', and restores the guard in the same transaction.
--
-- It refuses to touch anything that is not seed data.

create or replace function purge_seed_data(p_user_id uuid)
returns table (table_name text, rows_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  alter table activity_events disable trigger activity_events_no_delete;

  delete from activity_events where user_id = p_user_id and source = 'seed';
  get diagnostics n = row_count;
  table_name := 'activity_events'; rows_deleted := n; return next;

  alter table activity_events enable trigger activity_events_no_delete;

  delete from tasks where user_id = p_user_id and source = 'seed';
  get diagnostics n = row_count;
  table_name := 'tasks'; rows_deleted := n; return next;

  delete from milestones m
   using goals g
   where m.goal_id = g.id and g.user_id = p_user_id and m.source = 'seed';
  get diagnostics n = row_count;
  table_name := 'milestones'; rows_deleted := n; return next;

  delete from projects where user_id = p_user_id and source = 'seed';
  get diagnostics n = row_count;
  table_name := 'projects'; rows_deleted := n; return next;

  delete from habits where user_id = p_user_id and source = 'seed';
  get diagnostics n = row_count;
  table_name := 'habits'; rows_deleted := n; return next;

  delete from memories where user_id = p_user_id and source = 'seed';
  get diagnostics n = row_count;
  table_name := 'memories'; rows_deleted := n; return next;

  delete from goals where user_id = p_user_id and source = 'seed';
  get diagnostics n = row_count;
  table_name := 'goals'; rows_deleted := n; return next;

  return;
exception
  when others then
    -- Never leave the ledger unguarded.
    begin
      alter table activity_events enable trigger activity_events_no_delete;
    exception when others then null;
    end;
    raise;
end;
$$;

comment on function purge_seed_data is
  'Removes only rows with source=''seed''. The single sanctioned exception to the append-only ledger guard.';
