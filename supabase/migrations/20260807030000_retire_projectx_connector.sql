do $$
begin
  if exists (
    select 1
    from public.broker_connections
    where provider = 'projectx'
  ) then
    raise exception 'Refusing to retire ProjectX while broker_connections rows still exist';
  end if;
end
$$;

alter table public.broker_connections
  drop constraint if exists broker_connections_provider_check;

alter table public.broker_connections
  add constraint broker_connections_provider_check
  check (provider = 'tradovate') not valid;

alter table public.broker_connections
  validate constraint broker_connections_provider_check;
