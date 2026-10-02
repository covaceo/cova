-- PRODUCTION MIGRATION PROPOSAL ONLY. Never applied by this script or review.
-- Parent reports production workspace tables/RPCs absent; recheck catalog before approval.
-- Exact reviewed TEST contract is retained below; historical TEST-only comments
-- describe provenance, not the application status of this production proposal.
-- Requires the base app auth schema. Do not include the TEST QA schema baseline.
BEGIN;

-- Source: scripts/fixtures/workspace-contract/20261001003225_isolated_workspace_sync.sql
-- Additive workspace sync. No production deployment is authorized by this branch.
create table public.workspace_settings (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 disclosure_version text not null check(disclosure_version='workspace-cloud-v1'),
 consented_at timestamptz not null default clock_timestamp(),
 revision bigint not null default 0 check(revision>=0)
);
create table public.workspace_records (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('trade','rules','daily_note','account','broker_cash')),
 record_id text not null check(length(record_id) between 1 and 240),
 account_id text not null check(length(account_id) between 1 and 240),
 schema_version integer not null check(schema_version=1),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=2100000),
 revision bigint not null check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 deleted_at timestamptz,
 primary key(owner_id,kind,record_id)
);
create index workspace_records_owner_account on public.workspace_records(owner_id,account_id,kind,record_id);
create table public.workspace_operations (
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,operation_id)
);
alter table public.workspace_settings enable row level security;
alter table public.workspace_records enable row level security;
alter table public.workspace_operations enable row level security;
revoke all on public.workspace_settings,public.workspace_records,public.workspace_operations from public,anon,authenticated;
grant select on public.workspace_settings,public.workspace_records,public.workspace_operations to authenticated;
grant select,insert,update,delete on public.workspace_settings,public.workspace_records,public.workspace_operations to service_role;
create policy workspace_settings_owner_read on public.workspace_settings for select to authenticated using(owner_id=(select auth.uid()));
create policy workspace_records_owner_read on public.workspace_records for select to authenticated using(owner_id=(select auth.uid()));
create policy workspace_operations_owner_read on public.workspace_operations for select to authenticated using(owner_id=(select auth.uid()));

-- All writes pass the verified-user API and transactionally commit or roll back.
-- SECURITY INVOKER: no implicit RLS privilege escalation. Service-only EXECUTE.
create function public.cova_apply_workspace(p_owner uuid,p_operation uuid,p_hash text,p_records jsonb,p_max_trades integer,p_migration jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare oldop public.workspace_operations; previous public.workspace_records; item jsonb; changed jsonb:='[]'::jsonb; result jsonb; oldcount bigint; newcount bigint; workspace_revision bigint;
begin
 if p_owner is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_records is null or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 500 or p_max_trades is not null and p_max_trades<>25 then raise exception using errcode='22023',message='invalid_operation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,901));
 select * into oldop from public.workspace_operations where owner_id=p_owner and operation_id=p_operation;
 if oldop.owner_id is not null then
  if oldop.content_hash<>p_hash then raise exception using errcode='40001',message='operation_id_reused'; end if;
  return oldop.receipt;
 end if;
 if not exists(select 1 from public.workspace_settings where owner_id=p_owner and disclosure_version='workspace-cloud-v1') then raise exception using errcode='P0002',message='consent_required'; end if;
 if (select count(*) from jsonb_array_elements(p_records))<>(select count(distinct (x->>'kind',x->>'recordId')) from jsonb_array_elements(p_records) x) then raise exception using errcode='22023',message='duplicate_records'; end if;
 select count(*) into oldcount from public.workspace_records where owner_id=p_owner and kind='trade' and deleted_at is null;
 for item in select * from jsonb_array_elements(p_records) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['kind','recordId','accountId','schemaVersion','expectedRevision','deleted','payload']) or jsonb_typeof(item->'kind')<>'string' or jsonb_typeof(item->'recordId')<>'string' or jsonb_typeof(item->'accountId')<>'string' or jsonb_typeof(item->'schemaVersion')<>'number' or jsonb_typeof(item->'expectedRevision')<>'number' or item->>'expectedRevision' !~ '^[0-9]+$' or item->>'kind' not in ('trade','rules','daily_note','account','broker_cash') or length(item->>'recordId') not between 1 and 240 or length(item->>'accountId') not between 1 and 240 or (item->>'schemaVersion')::integer<>1 or (item->>'expectedRevision')::bigint<0 or jsonb_typeof(item->'deleted')<>'boolean' or jsonb_typeof(item->'payload')<>'object' then raise exception using errcode='22023',message='invalid_record'; end if;
  select * into previous from public.workspace_records where owner_id=p_owner and kind=item->>'kind' and record_id=item->>'recordId' for update;
  if coalesce(previous.revision,0)<>(item->>'expectedRevision')::bigint then raise exception using errcode='40001',message='revision_conflict'; end if;
  if previous.owner_id is not null and previous.kind='trade' and previous.account_id<>item->>'accountId' then raise exception using errcode='40001',message='trade_account_changed'; end if;
  -- Never silently revive a deletion, including stale migration imports.
  if previous.deleted_at is not null and not(item->>'deleted')::boolean then raise exception using errcode='40001',message='deleted_record'; end if;
  if previous.owner_id is null and (item->>'deleted')::boolean then raise exception using errcode='40001',message='missing_delete_target'; end if;
  insert into public.workspace_records(owner_id,kind,record_id,account_id,schema_version,payload,revision,deleted_at)
  values(p_owner,item->>'kind',item->>'recordId',item->>'accountId',1,case when (item->>'deleted')::boolean then '{}'::jsonb else item->'payload' end,coalesce(previous.revision,0)+1,case when (item->>'deleted')::boolean then clock_timestamp() else null end)
  on conflict(owner_id,kind,record_id) do update set account_id=excluded.account_id,schema_version=excluded.schema_version,payload=excluded.payload,revision=excluded.revision,updated_at=clock_timestamp(),deleted_at=excluded.deleted_at
  returning * into previous;
  changed:=changed||jsonb_build_array(jsonb_build_object('kind',previous.kind,'recordId',previous.record_id,'accountId',previous.account_id,'schemaVersion',previous.schema_version,'payload',previous.payload,'revision',previous.revision,'createdAt',previous.created_at,'updatedAt',previous.updated_at,'deletedAt',previous.deleted_at));
 end loop;
 select count(*) into newcount from public.workspace_records where owner_id=p_owner and kind='trade' and deleted_at is null;
 if p_max_trades is not null and newcount>p_max_trades and newcount>oldcount then raise exception using errcode='P0001',message='trade_cap_exceeded'; end if;
 update public.workspace_settings set revision=revision+1 where owner_id=p_owner returning revision into workspace_revision;
 result:=jsonb_build_object('operationId',p_operation,'contentHash',p_hash,'workspaceRevision',workspace_revision,'counts',(select jsonb_object_agg(kind,n) from (select kind,count(*) n from public.workspace_records where owner_id=p_owner and deleted_at is null group by kind) totals),'records',changed,'migration',p_migration);
 insert into public.workspace_operations(owner_id,operation_id,content_hash,receipt) values(p_owner,p_operation,p_hash,result);
 return result;
end $$;
revoke all on function public.cova_apply_workspace(uuid,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.cova_apply_workspace(uuid,uuid,text,jsonb,integer,jsonb) to service_role;


-- Source: scripts/fixtures/workspace-contract/20261001003802_workspace_service_grants.sql
-- Supabase default privileges may grant more than the workspace API needs.
revoke truncate,references,trigger on public.workspace_settings,public.workspace_records,public.workspace_operations from service_role;


-- Source: scripts/fixtures/workspace-contract/20261001005212_workspace_batch_manifest.sql
-- A global marker prevents other devices from treating partial batches as complete.
alter table public.workspace_settings add column pending_manifest jsonb check(pending_manifest is null or jsonb_typeof(pending_manifest)='object');
create or replace function public.cova_apply_workspace(p_owner uuid,p_operation uuid,p_hash text,p_records jsonb,p_max_trades integer,p_migration jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare oldop public.workspace_operations; previous public.workspace_records; item jsonb; changed jsonb:='[]'::jsonb; result jsonb; oldcount bigint; newcount bigint; workspace_revision bigint; manifest jsonb; batch_id uuid; batch_index integer; batch_total integer; batch_changes integer;
begin
 if p_owner is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_records is null or jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records) not between 1 and 500 or p_max_trades is not null and p_max_trades<>25 then raise exception using errcode='22023',message='invalid_operation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,901));
 select * into oldop from public.workspace_operations where owner_id=p_owner and operation_id=p_operation;
 if oldop.owner_id is not null then
  if oldop.content_hash<>p_hash then raise exception using errcode='40001',message='operation_id_reused'; end if;
  return oldop.receipt;
 end if;
 select pending_manifest into manifest from public.workspace_settings where owner_id=p_owner for update;
 if p_migration ? 'totalBatches' then
  if not(p_migration ?& array['backupId','contentHash','totalBatches','batch','totalChanges']) or jsonb_typeof(p_migration->'backupId')<>'string' or jsonb_typeof(p_migration->'contentHash')<>'string' or jsonb_typeof(p_migration->'totalBatches')<>'number' or jsonb_typeof(p_migration->'batch')<>'number' or jsonb_typeof(p_migration->'totalChanges')<>'number' or p_migration->>'totalBatches' !~ '^[0-9]+$' or p_migration->>'batch' !~ '^[0-9]+$' or p_migration->>'totalChanges' !~ '^[0-9]+$' or p_migration->>'contentHash' !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='invalid_batch'; end if;
  batch_id:=(p_migration->>'backupId')::uuid;batch_index:=(p_migration->>'batch')::integer;batch_total:=(p_migration->>'totalBatches')::integer;batch_changes:=(p_migration->>'totalChanges')::integer;
  if batch_id is null or batch_total<2 or batch_total>20000 or batch_index<0 or batch_index>=batch_total or batch_changes<=(batch_total-1)*500 or batch_changes>batch_total*500 or jsonb_array_length(p_records)<>(case when batch_index=batch_total-1 then batch_changes-(batch_total-1)*500 else 500 end) then raise exception using errcode='22023',message='invalid_batch'; end if;
  if manifest is null then
   if batch_index<>0 then raise exception using errcode='40001',message='missing_batch_start'; end if;
  elsif manifest->>'id'<>batch_id::text or (manifest->>'nextBatch')::integer<>batch_index or (manifest->>'totalBatches')::integer<>batch_total or (manifest->>'totalChanges')::integer<>batch_changes or manifest->>'contentHash'<>p_migration->>'contentHash' then
   raise exception using errcode='40001',message='incomplete_other_batch';
  end if;
 elsif manifest is not null then raise exception using errcode='40001',message='incomplete_other_batch';
 end if;
 if not exists(select 1 from public.workspace_settings where owner_id=p_owner and disclosure_version='workspace-cloud-v1') then raise exception using errcode='P0002',message='consent_required'; end if;
 if (select count(*) from jsonb_array_elements(p_records))<>(select count(distinct (x->>'kind',x->>'recordId')) from jsonb_array_elements(p_records) x) then raise exception using errcode='22023',message='duplicate_records'; end if;
 select count(*) into oldcount from public.workspace_records where owner_id=p_owner and kind='trade' and deleted_at is null;
 for item in select * from jsonb_array_elements(p_records) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['kind','recordId','accountId','schemaVersion','expectedRevision','deleted','payload']) or jsonb_typeof(item->'kind')<>'string' or jsonb_typeof(item->'recordId')<>'string' or jsonb_typeof(item->'accountId')<>'string' or jsonb_typeof(item->'schemaVersion')<>'number' or jsonb_typeof(item->'expectedRevision')<>'number' or item->>'expectedRevision' !~ '^[0-9]+$' or item->>'kind' not in ('trade','rules','daily_note','account','broker_cash') or length(item->>'recordId') not between 1 and 240 or length(item->>'accountId') not between 1 and 240 or (item->>'schemaVersion')::integer<>1 or (item->>'expectedRevision')::bigint<0 or jsonb_typeof(item->'deleted')<>'boolean' or jsonb_typeof(item->'payload')<>'object' then raise exception using errcode='22023',message='invalid_record'; end if;
  select * into previous from public.workspace_records where owner_id=p_owner and kind=item->>'kind' and record_id=item->>'recordId' for update;
  if coalesce(previous.revision,0)<>(item->>'expectedRevision')::bigint then raise exception using errcode='40001',message='revision_conflict'; end if;
  if previous.owner_id is not null and previous.kind='trade' and previous.account_id<>item->>'accountId' then raise exception using errcode='40001',message='trade_account_changed'; end if;
  -- Never silently revive a deletion, including stale migration imports.
  if previous.deleted_at is not null and not(item->>'deleted')::boolean then raise exception using errcode='40001',message='deleted_record'; end if;
  if previous.owner_id is null and (item->>'deleted')::boolean then raise exception using errcode='40001',message='missing_delete_target'; end if;
  insert into public.workspace_records(owner_id,kind,record_id,account_id,schema_version,payload,revision,deleted_at)
  values(p_owner,item->>'kind',item->>'recordId',item->>'accountId',1,case when (item->>'deleted')::boolean then '{}'::jsonb else item->'payload' end,coalesce(previous.revision,0)+1,case when (item->>'deleted')::boolean then clock_timestamp() else null end)
  on conflict(owner_id,kind,record_id) do update set account_id=excluded.account_id,schema_version=excluded.schema_version,payload=excluded.payload,revision=excluded.revision,updated_at=clock_timestamp(),deleted_at=excluded.deleted_at
  returning * into previous;
  changed:=changed||jsonb_build_array(jsonb_build_object('kind',previous.kind,'recordId',previous.record_id,'accountId',previous.account_id,'schemaVersion',previous.schema_version,'payload',previous.payload,'revision',previous.revision,'createdAt',previous.created_at,'updatedAt',previous.updated_at,'deletedAt',previous.deleted_at));
 end loop;
 select count(*) into newcount from public.workspace_records where owner_id=p_owner and kind='trade' and deleted_at is null;
 if p_max_trades is not null and newcount>p_max_trades and newcount>oldcount then raise exception using errcode='P0001',message='trade_cap_exceeded'; end if;
 if batch_id is not null then
  update public.workspace_settings set pending_manifest=case when batch_index=batch_total-1 then null else jsonb_build_object('id',batch_id,'nextBatch',batch_index+1,'totalBatches',batch_total,'totalChanges',batch_changes,'contentHash',p_migration->>'contentHash') end where owner_id=p_owner;
 end if;
 update public.workspace_settings set revision=revision+1 where owner_id=p_owner returning revision into workspace_revision;
 result:=jsonb_build_object('operationId',p_operation,'contentHash',p_hash,'workspaceRevision',workspace_revision,'counts',(select jsonb_object_agg(kind,n) from (select kind,count(*) n from public.workspace_records where owner_id=p_owner and deleted_at is null group by kind) totals),'records',changed,'migration',p_migration);
 insert into public.workspace_operations(owner_id,operation_id,content_hash,receipt) values(p_owner,p_operation,p_hash,result);
 return result;
end $$;
revoke all on function public.cova_apply_workspace(uuid,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.cova_apply_workspace(uuid,uuid,text,jsonb,integer,jsonb) to service_role;


-- Source: docs/workspace-atomic-plan.sql
-- PROPOSED ADDITIVE MIGRATION ONLY. Not applied to TEST or production.
-- Depends on the three observed workspace migrations. CLI migration creation
-- is blocked by its read-only global config directory in this executor.
-- A single RPC transaction contains every <=500-row inner operation. A late
-- conflict rolls back all earlier chunks and their receipts, never stranding a
-- partially copied workspace. Existing incomplete legacy manifests still block.
create function public.cova_apply_workspace_plan(
 p_owner uuid, p_operation uuid, p_hash text, p_records jsonb,
 p_max_trades integer, p_migration jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare prior public.workspace_operations; result jsonb; changed jsonb:='[]'::jsonb;
 chunk jsonb; item jsonb; previous public.workspace_records; n integer; i integer; child uuid; oldcount bigint; newcount bigint;
begin
 if p_owner is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 or p_records is null or jsonb_typeof(p_records)<>'array'
 or jsonb_array_length(p_records) not between 1 and 25000
 or octet_length(p_records::text)>4000000
 or (p_max_trades is not null and p_max_trades<>25)
 or (p_migration is not null and p_migration ? 'totalBatches') then
  raise exception using errcode='22023',message='invalid_operation';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,901));
 select * into prior from public.workspace_operations where owner_id=p_owner and operation_id=p_operation;
 if prior.owner_id is not null then
  if prior.content_hash<>p_hash then raise exception using errcode='40001',message='operation_id_reused';end if;
  return prior.receipt;
 end if;
 if (select count(*) from jsonb_array_elements(p_records))<>(select count(distinct (x->>'kind',x->>'recordId')) from jsonb_array_elements(p_records) x) then
  raise exception using errcode='22023',message='duplicate_records';
 end if;
 select count(*) into oldcount from public.workspace_records where owner_id=p_owner and kind='trade' and deleted_at is null;
 -- Explicit recreation is restricted to a reviewed, exact-version daily-note
 -- tombstone. The existing inner RPC still rejects all ordinary revivals.
 -- This temporary state and all later writes roll back together on any failure.
 for item in select * from jsonb_array_elements(p_records) loop
  if item ? 'recreateDailyNote' then
   if item->'recreateDailyNote' is distinct from 'true'::jsonb or item->>'kind' <> 'daily_note'
      or item->'deleted' is distinct from 'false'::jsonb
      or jsonb_typeof(item->'payload') <> 'object'
      or jsonb_typeof(item->'payload'->'date') <> 'string'
      or (item->>'recordId')::jsonb is distinct from jsonb_build_array(item->>'accountId',item->'payload'->>'date') then
    raise exception using errcode='22023',message='invalid_daily_note_recreation';
   end if;
   select * into previous from public.workspace_records where owner_id=p_owner
     and kind='daily_note' and record_id=item->>'recordId' for update;
   if previous.owner_id is null or previous.deleted_at is null
      or previous.account_id <> item->>'accountId'
      or previous.revision <> (item->>'expectedRevision')::bigint then
    raise exception using errcode='40001',message='revision_conflict';
   end if;
   update public.workspace_records set deleted_at=null where owner_id=p_owner
     and kind='daily_note' and record_id=previous.record_id;
  end if;
 end loop;
 n:=jsonb_array_length(p_records);
 for i in 0..((n-1)/500) loop
  select jsonb_agg(value order by ordinality) into chunk from jsonb_array_elements(p_records) with ordinality where ordinality>i*500 and ordinality<=least((i+1)*500,n);
  child:=md5(p_operation::text||':'||i::text)::uuid;
  result:=public.cova_apply_workspace(p_owner,child,p_hash,chunk,null,p_migration);
  changed:=changed||(result->'records');
 end loop;
 select count(*) into newcount from public.workspace_records where owner_id=p_owner and kind='trade' and deleted_at is null;
 if p_max_trades is not null and newcount>p_max_trades and newcount>oldcount then
  raise exception using errcode='P0001',message='trade_cap_exceeded';
 end if;
 result:=result||jsonb_build_object('operationId',p_operation,'records',changed);
 insert into public.workspace_operations(owner_id,operation_id,content_hash,receipt) values(p_owner,p_operation,p_hash,result);
 return result;
end $$;
revoke all on function public.cova_apply_workspace_plan(uuid,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.cova_apply_workspace_plan(uuid,uuid,text,jsonb,integer,jsonb) to service_role;


-- Reset ALL table privileges, including PostgreSQL 17+ MAINTAIN and any
-- default grants, then allow only the four DML privileges the API requires.
REVOKE ALL PRIVILEGES ON TABLE public.workspace_settings,
  public.workspace_records, public.workspace_operations FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_settings,
  public.workspace_records, public.workspace_operations TO service_role;
COMMIT;
