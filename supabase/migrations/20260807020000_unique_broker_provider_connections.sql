begin;

with ranked_connections as (
  select
    id,
    row_number() over (
      partition by user_id, provider
      order by updated_at desc, created_at desc, id desc
    ) as owner_provider_rank
  from public.broker_connections
)
delete from public.broker_connections as connection
using ranked_connections as ranked
where connection.id = ranked.id
  and ranked.owner_provider_rank > 1;

create unique index if not exists broker_connections_user_provider_key
  on public.broker_connections (user_id, provider);

commit;
