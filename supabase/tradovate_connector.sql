create table if not exists public.broker_connections (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_scope text,
  expires_at timestamptz,
  status text not null default 'connected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists broker_connections_provider_idx
  on public.broker_connections (provider, status);

create index if not exists broker_connections_user_idx
  on public.broker_connections (user_id, provider);

alter table public.broker_connections enable row level security;

create policy "Users can read their broker connections"
  on public.broker_connections
  for select
  using (auth.uid() = user_id);

create policy "Service role can manage broker connections"
  on public.broker_connections
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
