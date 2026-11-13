-- Lets /api/health report which migrations the database has applied.
--
-- supabase_migrations is not exposed through PostgREST, so a public function
-- returns the version strings and nothing else: no names, no statements, no
-- timestamps. The same list is in the repository, so it reveals nothing new.
-- Callable by anon because the health endpoint runs without a session.
--
-- If the migrations table does not exist (a database set up by pasting SQL
-- into the editor instead of `supabase db push`), it returns no rows rather
-- than failing, and /api/health reports every migration as pending.

create or replace function public.applied_migrations()
returns table (version text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    return;
  end if;
  return query execute
    'select m.version::text from supabase_migrations.schema_migrations m order by m.version';
end;
$$;

revoke all on function public.applied_migrations() from public;
grant execute on function public.applied_migrations() to anon, authenticated, service_role;
