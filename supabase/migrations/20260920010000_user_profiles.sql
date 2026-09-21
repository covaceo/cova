-- Private account identity. No email copy: admin lookup reads auth.users.
-- Apply before deploying the profile UI. Existing accounts remain valid without a profile.
begin;
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  avatar_data text,
  constraint user_profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  -- A bounded, re-encoded 256px JPEG thumbnail; never arbitrary URLs or SVG/HTML.
  constraint user_profiles_avatar_format check (
    avatar_data is null or (
      octet_length(avatar_data) <= 100000
      and avatar_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'
    )
  )
);
alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from public, anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
create policy "Members read own profile" on public.user_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Members create own profile" on public.user_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Members update own profile" on public.user_profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Exact admin lookup only. Not callable by anonymous or signed-in app users.
create function public.lookup_cova_account(identifier text)
returns table(user_id uuid, email text, username text)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email::text, p.username
  from auth.users u left join public.user_profiles p on p.user_id = u.id
  where lower(u.email) = lower(btrim(identifier))
     or p.username = lower(regexp_replace(btrim(identifier), '^@', ''));
$$;
revoke all on function public.lookup_cova_account(text) from public, anon, authenticated;
grant execute on function public.lookup_cova_account(text) to service_role;
notify pgrst, 'reload schema';
commit;
