-- Provenance on memories.
-- Migration: 20261113000000_memory_provenance.sql

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

insert into auth.users (id, email, aud, role)
values ('abababab-0000-0000-0000-000000000007', 'm@test.local', 'authenticated', 'authenticated');

select pg_temp.check('source_type is not null and has no default',
  (select is_nullable = 'NO' and column_default is null from information_schema.columns
    where table_schema = 'public' and table_name = 'memories' and column_name = 'source_type'));
select pg_temp.check('every existing memory has a source_type',
  (select count(*) = 0 from public.memories where source_type is null));

select pg_temp.expect_error('a memory without a source_type is rejected',
  $q$ insert into public.memories (user_id, kind, content) values ('abababab-0000-0000-0000-000000000007', 'profile', 'x') $q$, '23502');
select pg_temp.expect_error('an unknown source_type is rejected',
  $q$ insert into public.memories (user_id, kind, content, source_type) values ('abababab-0000-0000-0000-000000000007', 'profile', 'x', 'rumor') $q$, '23514');
select pg_temp.expect_error('confidence above 1 is rejected',
  $q$ insert into public.memories (user_id, kind, content, source_type, confidence) values ('abababab-0000-0000-0000-000000000007', 'profile', 'x', 'observed', 1.5) $q$, '23514');
select pg_temp.expect_error('confidence below 0 is rejected',
  $q$ insert into public.memories (user_id, kind, content, source_type, confidence) values ('abababab-0000-0000-0000-000000000007', 'profile', 'x', 'derived', -0.1) $q$, '23514');
select pg_temp.expect_error('an external memory without a real source is rejected',
  $q$ insert into public.memories (user_id, kind, content, source_type) values ('abababab-0000-0000-0000-000000000007', 'profile', 'x', 'external') $q$, '23514');
select pg_temp.expect_error('an external memory whose source is the seed marker is rejected',
  $q$ insert into public.memories (user_id, kind, content, source_type, source) values ('abababab-0000-0000-0000-000000000007', 'profile', 'x', 'external', 'seed') $q$, '23514');

insert into public.memories (user_id, kind, content, source_type, confidence, source) values
  ('abababab-0000-0000-0000-000000000007', 'profile', 'stated',   'stated',   null, 'user'),
  ('abababab-0000-0000-0000-000000000007', 'profile', 'observed', 'observed', 0,    'user'),
  ('abababab-0000-0000-0000-000000000007', 'profile', 'derived',  'derived',  1,    'user'),
  ('abababab-0000-0000-0000-000000000007', 'profile', 'external', 'external', 0.5,  'gmail:18f2a');
select pg_temp.check('all four source types are accepted, confidence 0 and 1 included',
  (select count(*) = 4 from public.memories where user_id = 'abababab-0000-0000-0000-000000000007'));

\echo 'ALL SQL CHECKS PASSED'
rollback;
