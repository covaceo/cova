create extension if not exists pgcrypto;

create table public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  source text not null check (source in ('web-signup')),
  unique (user_id, terms_version, privacy_version)
);

create index policy_acceptances_user_id_idx
  on public.policy_acceptances (user_id);

create or replace function public.prevent_policy_acceptance_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'policy acceptance rows are immutable';
end;
$$;

create trigger prevent_policy_acceptance_update
before update on public.policy_acceptances
for each row execute function public.prevent_policy_acceptance_update();

alter table public.policy_acceptances enable row level security;
revoke all on public.policy_acceptances from anon;
revoke all on public.policy_acceptances from authenticated;
grant select, insert on public.policy_acceptances to service_role;
grant select on public.policy_acceptances to authenticated;

create policy "Members can read own policy acceptances"
on public.policy_acceptances
for select
to authenticated
using (auth.uid() = user_id);
