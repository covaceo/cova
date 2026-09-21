-- Server-owned username cooldown. Apply before the new profile editor is deployed.
-- Existing profiles begin their first 14-day window when this migration is applied.
begin;
alter table public.user_profiles
  add column username_changed_at timestamptz not null default clock_timestamp();

create function public.enforce_username_change_cooldown()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  server_now timestamptz := clock_timestamp();
begin
  if TG_OP = 'INSERT' then
    NEW.username_changed_at := server_now;
  elsif NEW.username is distinct from OLD.username then
    if server_now < OLD.username_changed_at + interval '336 hours' then
      raise exception using errcode = 'P0001', message = 'username_change_cooldown';
    end if;
    NEW.username_changed_at := server_now;
  else
    -- Ignore client-supplied clocks, including no-op upserts and photo-only edits.
    NEW.username_changed_at := OLD.username_changed_at;
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_username_change_cooldown() from public, anon, authenticated;
create trigger user_profiles_username_cooldown
before insert or update on public.user_profiles
for each row execute function public.enforce_username_change_cooldown();
comment on column public.user_profiles.username_changed_at is 'Database-owned last username assignment; 336 elapsed hours between changes. Photo edits do not reset it.';
notify pgrst, 'reload schema';
commit;
