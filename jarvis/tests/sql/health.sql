-- applied_migrations(), the function behind /api/health.
-- Migration: 20261112000000_applied_migrations.sql

\set ON_ERROR_STOP on
begin;

create function pg_temp.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL %', p_label; end if;
  raise notice 'ok  %', p_label;
end $$;
grant execute on all functions in schema pg_temp to anon;

set local role anon;
select pg_temp.check('anon can list applied migrations, and it includes this one',
  (select bool_or(version = '20261112000000') from public.applied_migrations()));
select pg_temp.check('it returns the version column only',
  (select array_agg(x.parameter_name::text) = array['version'] from information_schema.routines r
     join information_schema.parameters x on x.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'applied_migrations' and x.parameter_mode = 'OUT'));
reset role;

select pg_temp.check('anon still cannot read supabase_migrations directly',
  not has_schema_privilege('anon', 'supabase_migrations', 'usage')
  or not has_table_privilege('anon', 'supabase_migrations.schema_migrations', 'select'));

\echo 'ALL SQL CHECKS PASSED'
rollback;
