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
 chunk jsonb; n integer; i integer; child uuid;
begin
 if p_owner is null or p_operation is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 or p_records is null or jsonb_typeof(p_records)<>'array'
 or jsonb_array_length(p_records) not between 1 and 25000
 or octet_length(p_records::text)>4000000
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
 n:=jsonb_array_length(p_records);
 for i in 0..((n-1)/500) loop
  select jsonb_agg(value order by ordinality) into chunk from jsonb_array_elements(p_records) with ordinality where ordinality>i*500 and ordinality<=least((i+1)*500,n);
  child:=md5(p_operation::text||':'||i::text)::uuid;
  result:=public.cova_apply_workspace(p_owner,child,p_hash,chunk,p_max_trades,p_migration);
  changed:=changed||(result->'records');
 end loop;
 result:=result||jsonb_build_object('operationId',p_operation,'records',changed);
 insert into public.workspace_operations(owner_id,operation_id,content_hash,receipt) values(p_owner,p_operation,p_hash,result);
 return result;
end $$;
revoke all on function public.cova_apply_workspace_plan(uuid,uuid,text,jsonb,integer,jsonb) from public,anon,authenticated;
grant execute on function public.cova_apply_workspace_plan(uuid,uuid,text,jsonb,integer,jsonb) to service_role;
