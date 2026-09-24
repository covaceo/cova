-- Server-owned, owner-isolated progression. Imported trading facts remain user supplied.
create table public.passport_rule_plans (
 id bigint generated always as identity primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 limits jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index passport_rule_plans_owner_time on public.passport_rule_plans(owner_id,created_at desc);
alter table public.passport_rule_plans enable row level security;
revoke all on public.passport_rule_plans from public,anon,authenticated;
grant select on public.passport_rule_plans to authenticated;
create policy passport_plan_owner_read on public.passport_rule_plans for select to authenticated using(owner_id=(select auth.uid()));

create function public.passport_save_plan(p_owner uuid,p_limits jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.passport_rule_plans; key text; value numeric;
begin
 if auth.uid() is null or p_owner is distinct from auth.uid() then raise exception 'session_changed'; end if;
 if p_limits is null or jsonb_typeof(p_limits)<>'object' or (select count(*) from jsonb_object_keys(p_limits))<>4 then raise exception 'invalid_limits'; end if;
 foreach key in array array['maxDailyLoss','maxTradeLoss','maxContracts','maxLossStreak'] loop
  if not(p_limits ? key) then raise exception 'invalid_limits'; end if;
  if p_limits->key <> 'null'::jsonb then
   if jsonb_typeof(p_limits->key)<>'number' then raise exception 'invalid_limits'; end if;
   value:=(p_limits->>key)::numeric;
   if value<=0 or value>10000000 or (key in ('maxContracts','maxLossStreak') and trunc(value)<>value) then raise exception 'invalid_limits'; end if;
  end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 select * into previous from public.passport_rule_plans where owner_id=p_owner order by created_at desc,id desc limit 1;
 if previous.id is not null and previous.limits=p_limits then return to_jsonb(previous); end if;
 insert into public.passport_rule_plans(owner_id,limits) values(p_owner,p_limits) returning * into previous;
 return to_jsonb(previous);
end $$;
revoke all on function public.passport_save_plan(uuid,jsonb) from public,anon;
grant execute on function public.passport_save_plan(uuid,jsonb) to authenticated;

create table public.passport_session_reviews (
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_day date not null,
 account_key text not null check(length(account_key) between 1 and 200),
 note text not null check(length(btrim(note)) between 10 and 2000),
 xp integer not null check(xp in (0,15,60)),
 reason text not null default '',
 revision integer not null default 1 check(revision>0),
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 evidence_as_of timestamptz,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,session_day,account_key)
);
create table public.passport_reward_days (
 owner_id uuid not null references auth.users(id) on delete cascade,
 session_day date not null,
 account_key text not null,
 primary key(owner_id,session_day)
);
alter table public.passport_session_reviews enable row level security;
alter table public.passport_reward_days enable row level security;
revoke all on public.passport_session_reviews,public.passport_reward_days from public,anon,authenticated;
grant select on public.passport_session_reviews,public.passport_reward_days to authenticated;
create policy passport_review_owner_read on public.passport_session_reviews for select to authenticated using(owner_id=(select auth.uid()));
create policy passport_reward_owner_read on public.passport_reward_days for select to authenticated using(owner_id=(select auth.uid()));

-- Only the authenticated API's server identity may submit calculated rewards.
create function public.passport_commit_review(p_owner uuid,p_day date,p_account text,p_note text,p_xp integer,p_reason text,p_hash text,p_as_of timestamptz,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.passport_session_reviews; bound_account text; awarded integer:=p_xp; reason text:=coalesce(p_reason,'');
begin
 if p_owner is null or p_day is null or p_day>(clock_timestamp() at time zone 'UTC')::date or p_account is null or length(p_account) not between 1 and 200 or p_note is null or length(btrim(p_note)) not between 10 and 2000 or p_xp is null or p_xp not in (0,15,60) or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_revision is null or p_revision<0 or length(reason)>300 or p_as_of>clock_timestamp()+interval '5 seconds' then raise exception 'invalid_review'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_day::text,0));
 select account_key into bound_account from public.passport_reward_days where owner_id=p_owner and session_day=p_day;
 if bound_account is not null and bound_account<>p_account then awarded:=0;reason:='A session reward is already assigned to another account for this day.'; end if;
 select * into previous from public.passport_session_reviews where owner_id=p_owner and session_day=p_day and account_key=p_account for update;
 if previous.owner_id is not null and previous.evidence_hash=p_hash and previous.note=btrim(p_note) and previous.xp=awarded and previous.reason=reason then return to_jsonb(previous); end if;
 if coalesce(previous.revision,0)<>p_revision then raise exception 'revision_conflict'; end if;
 if previous.evidence_as_of is not null and previous.evidence_hash<>p_hash and (p_as_of is null or p_as_of<=previous.evidence_as_of) then raise exception 'stale_evidence'; end if;
 if awarded>0 and bound_account is null then insert into public.passport_reward_days(owner_id,session_day,account_key) values(p_owner,p_day,p_account); end if;
 insert into public.passport_session_reviews(owner_id,session_day,account_key,note,xp,reason,revision,evidence_hash,evidence_as_of)
 values(p_owner,p_day,p_account,btrim(p_note),awarded,reason,coalesce(previous.revision,0)+1,p_hash,p_as_of)
 on conflict(owner_id,session_day,account_key) do update set note=excluded.note,xp=excluded.xp,reason=excluded.reason,revision=excluded.revision,evidence_hash=excluded.evidence_hash,evidence_as_of=excluded.evidence_as_of,updated_at=clock_timestamp()
 returning * into previous;
 return to_jsonb(previous);
end $$;
revoke all on function public.passport_commit_review(uuid,date,text,text,integer,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.passport_commit_review(uuid,date,text,text,integer,text,text,timestamptz,integer) to service_role;

create function public.passport_progress_snapshot(p_owner uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('owner_id',p_owner,'total_xp',(select coalesce(sum(xp),0) from public.passport_session_reviews where owner_id=p_owner),'receipts',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from public.passport_session_reviews where owner_id=p_owner order by session_day desc,updated_at desc limit 90) r),'[]'::jsonb));
$$;
revoke all on function public.passport_progress_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.passport_progress_snapshot(uuid) to service_role;
grant select on public.passport_rule_plans,public.passport_session_reviews,public.passport_reward_days to service_role;
