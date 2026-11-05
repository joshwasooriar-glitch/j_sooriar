-- A new auth user gets a profile, so they can own goals immediately.
\set ON_ERROR_STOP on
begin;

create function pg_temp.check(p_label text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAIL %', p_label; end if;
  raise notice 'ok  %', p_label;
end $$;

insert into auth.users (id, email, aud, role)
values ('cccccccc-0000-0000-0000-000000000003', 'joshwa.test@example.com', 'authenticated', 'authenticated');

select pg_temp.check('a new auth user gets a profile named from the email',
  (select display_name = 'joshwa.test' from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003'));
select pg_temp.check('the profile defaults to the New York timezone',
  (select timezone = 'America/New_York' from public.profiles where id = 'cccccccc-0000-0000-0000-000000000003'));
insert into public.goals (user_id, title, start_date)
values ('cccccccc-0000-0000-0000-000000000003', 'First goal', current_date);
select pg_temp.check('the new user can own a goal straight away',
  (select count(*) = 1 from public.goals where user_id = 'cccccccc-0000-0000-0000-000000000003'));
select pg_temp.check('the trigger function is not callable by app roles',
  (select not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
      and not has_function_privilege('anon', 'public.handle_new_user()', 'execute')));

\echo 'ALL SQL CHECKS PASSED'
rollback;
