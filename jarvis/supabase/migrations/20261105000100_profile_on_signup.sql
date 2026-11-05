-- Create the profile row when an auth user is created.
--
-- Every user-owned table references profiles(id), so without this a new
-- account cannot create a single goal. No new table: a function and a trigger.
--
-- SECURITY DEFINER because it runs during sign-up, before the user has a
-- session; search_path is empty and every name is qualified. It only ever
-- inserts the new user's own id, and does nothing if a profile already exists.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'You'))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
