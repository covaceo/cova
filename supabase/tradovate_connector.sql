create extension if not exists pgcrypto;

create table if not exists public.broker_connections (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('tradovate', 'projectx')),
  provider_account_id text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_scope text,
  expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.broker_connections add column if not exists user_id uuid;
delete from public.broker_connections where user_id is null;
alter table public.broker_connections alter column user_id set not null;

alter table public.broker_connections
  drop constraint if exists broker_connections_user_id_fkey;
alter table public.broker_connections
  add constraint broker_connections_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

create index if not exists broker_connections_user_id_idx on public.broker_connections (user_id);
create index if not exists broker_connections_provider_idx on public.broker_connections (provider);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists broker_connections_set_updated_at on public.broker_connections;
create trigger broker_connections_set_updated_at
before update on public.broker_connections
for each row execute procedure public.set_updated_at();

alter table public.broker_connections enable row level security;
revoke all on public.broker_connections from anon;
grant select, delete on public.broker_connections to authenticated;

drop policy if exists "Members can read own broker connections" on public.broker_connections;
create policy "Members can read own broker connections"
on public.broker_connections for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Members can delete own broker connections" on public.broker_connections;
create policy "Members can delete own broker connections"
on public.broker_connections for delete
to authenticated
using (auth.uid() = user_id);
