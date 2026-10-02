// Disposable database only. COVA_PGLITE_MODULE can select an isolated PG17 build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.COVA_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
test('production proposal resets PG17+ MAINTAIN/default grants and preserves owner/RPC boundaries', async () => {
  const version=(await db.query('select version()')).rows[0].version;
  console.log('Disposable SQL engine: '+version);
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;
    alter default privileges in schema public grant all privileges on tables to service_role;
    create table public.privilege_probe(id integer);
    revoke truncate,references,trigger on public.privilege_probe from service_role;`);
  assert.equal((await db.query("select has_table_privilege('service_role','public.privilege_probe','MAINTAIN') as allowed")).rows[0].allowed,true,
    'The old three-privilege revoke must leave MAINTAIN granted in this fixture');
  await db.exec('drop table public.privilege_probe');
  await db.exec(readFileSync(new URL('../docs/workspace-production-proposal.sql',import.meta.url),'utf8'));
  for(const name of ['workspace_settings','workspace_records','workspace_operations']) {
    const acl=await db.query(`select x.privilege_type as privilege from pg_class c
      cross join lateral aclexplode(c.relacl) x where c.oid=$1::regclass
      and x.grantee=(select oid from pg_roles where rolname='service_role') order by 1`,['public.'+name]);
    assert.deepEqual(acl.rows.map(r=>r.privilege),['DELETE','INSERT','SELECT','UPDATE']);
    for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) as allowed',['service_role','public.'+name,privilege])).rows[0].allowed,false);
    assert.equal((await db.query('select relrowsecurity as enabled from pg_class where oid=$1::regclass',['public.'+name])).rows[0].enabled,true);
    const policies=(await db.query('select cmd,roles,qual from pg_policies where schemaname=$1 and tablename=$2',['public',name])).rows;
    assert.equal(policies.length,1);assert.equal(policies[0].cmd,'SELECT');assert.match(policies[0].qual,/owner_id.*auth.uid/s);
    assert.deepEqual(policies[0].roles,['authenticated']);
  }
  for(const name of ['cova_apply_workspace','cova_apply_workspace_plan']) {
    const signature=`public.${name}(uuid,uuid,text,jsonb,integer,jsonb)`;
    const fn=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
    assert.equal(fn.prosecdef,false);assert.deepEqual(fn.proconfig,['search_path=""']);
    for(const role of ['anon','authenticated','service_role'])
      assert.equal((await db.query('select has_function_privilege($1,$2,$3) as allowed',[role,signature,'EXECUTE'])).rows[0].allowed,role==='service_role');
  }
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values ($1),($2)',[a,b]);
  await db.exec('set role service_role');
  await db.query("insert into workspace_settings(owner_id,disclosure_version) values ($1,'workspace-cloud-v1'),($2,'workspace-cloud-v1')",[a,b]);
  const records=[{kind:'daily_note',recordId:'["local","2026-10-01"]',accountId:'local',schemaVersion:1,payload:{date:'2026-10-01',note:'Synthetic SQL fixture',tradeId:null},expectedRevision:0,deleted:false}];
  for(const owner of [a,b])await db.query('select cova_apply_workspace_plan($1,$2,$3,$4::jsonb,null,null)',[owner,crypto.randomUUID(),'a'.repeat(64),JSON.stringify(records)]);
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  assert.deepEqual((await db.query('select owner_id from workspace_records')).rows,[{owner_id:a}]);
  await assert.rejects(db.exec('update workspace_records set deleted_at=null'),/permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.exec('select * from workspace_records'),/permission denied/);
  await db.exec('reset role');
});
test.after(()=>db.close());
