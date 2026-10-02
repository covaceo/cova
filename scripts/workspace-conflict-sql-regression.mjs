// Disposable PostgreSQL only. Never connects to a hosted project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.COVA_PGLITE_MODULE || '@electric-sql/pglite');
const original = readFileSync(new URL('../docs/workspace-production-proposal.sql', import.meta.url), 'utf8');
const correction = readFileSync(new URL('../docs/workspace-conflict-errors.sql', import.meta.url), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const tables = ['workspace_settings', 'workspace_records', 'workspace_operations'];
const functions = ['cova_apply_workspace', 'cova_apply_workspace_plan'];
const record = { kind: 'daily_note', recordId: '["local","2026-10-02"]', accountId: 'local', schemaVersion: 1, payload: { date: '2026-10-02', note: 'Synthetic conflict QA', tradeId: null }, expectedRevision: 0, deleted: false };

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,service_role;`);
  await db.exec(original);
  await db.query('insert into auth.users values ($1)', [owner]);
  await db.query("insert into workspace_settings(owner_id,disclosure_version) values ($1,'workspace-cloud-v1')", [owner]);
  return db;
}
async function apply(db, fn, records, operation = crypto.randomUUID(), hash = 'a'.repeat(64)) {
  return db.query(`select public.${fn}($1,$2,$3,$4::jsonb,25,null) result`, [owner,operation,hash,JSON.stringify(records)]);
}
async function snapshot(db) {
  const rows = {};
  for (const table of tables) rows[table] = (await db.query(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`)).rows;
  return rows;
}
async function definitions(db) {
  const result = {};
  for (const name of functions) result[name] = (await db.query('select pg_get_functiondef($1::regprocedure) definition', [`public.${name}(uuid,uuid,text,jsonb,integer,jsonb)`])).rows[0].definition;
  return result;
}

test('intentional stale/reused/deleted conflicts return PT409, not Hasql-retryable 40001', async () => {
  const db = await database();
  try {
    console.log('Disposable SQL engine: '+(await db.query('select version()')).rows[0].version);
    const beforeDefinitions = await definitions(db);
    await db.exec(correction);
    const afterDefinitions = await definitions(db);
    for (const name of functions) {
      assert.equal(afterDefinitions[name].replaceAll('\r\n', '\n'), beforeDefinitions[name].replaceAll('\r\n', '\n').replaceAll("errcode='40001'", "errcode='PT409'"), 'Only the deliberate conflict SQLSTATE may change');
    }
    const operation = crypto.randomUUID();
    const saved = await apply(db, 'cova_apply_workspace_plan', [record], operation);
    assert.deepEqual(await apply(db, 'cova_apply_workspace_plan', [record], operation), saved, 'Successful operation remains idempotent');
    const before = await snapshot(db);
    for (const fn of functions) {
      await assert.rejects(apply(db, fn, [record]), error => {
        assert.equal(error.message, 'revision_conflict');
        assert.equal(error.code, 'PT409', 'An application conflict must not trigger Hasql transaction retries');
        return true;
      });
    }
    await assert.rejects(apply(db, 'cova_apply_workspace_plan', [record], operation, 'b'.repeat(64)), error => error.code === 'PT409' && error.message === 'operation_id_reused');
    assert.deepEqual(await snapshot(db), before, 'Rejected operations leave records, settings and receipts unchanged');
    await apply(db, 'cova_apply_workspace_plan', [{...record, expectedRevision: 1, deleted: true, payload: {}}]);
    await assert.rejects(apply(db, 'cova_apply_workspace_plan', [{...record, expectedRevision: 2}]), error => error.code === 'PT409' && error.message === 'deleted_record');
    const final = await snapshot(db);
    await db.exec(correction);
    assert.deepEqual(await snapshot(db), final, 'Reapplying correction preserves every row');
  } finally { await db.close(); }
});

test('conflict correction preserves an emergency pause, RLS, owner policies and RPC security', async () => {
  const db = await database();
  try {
    await apply(db, 'cova_apply_workspace_plan', [record]);
    await db.exec(`begin;
      revoke execute on function public.cova_apply_workspace(uuid,uuid,text,jsonb,integer,jsonb),public.cova_apply_workspace_plan(uuid,uuid,text,jsonb,integer,jsonb) from service_role;
      revoke insert,update,delete on public.workspace_settings,public.workspace_records,public.workspace_operations from service_role;
      commit;`);
    const before = await snapshot(db);
    await db.exec(correction);
    assert.deepEqual(await snapshot(db), before);
    for (const table of tables) {
      for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'])
        assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed', ['service_role','public.'+table,privilege])).rows[0].allowed, privilege === 'SELECT');
      assert.equal((await db.query('select relrowsecurity enabled from pg_class where oid=$1::regclass', ['public.'+table])).rows[0].enabled, true);
      const policies=(await db.query('select cmd,roles,qual from pg_policies where schemaname=$1 and tablename=$2', ['public',table])).rows;
      assert.equal(policies.length,1); assert.equal(policies[0].cmd,'SELECT');
      assert.deepEqual(policies[0].roles,['authenticated']); assert.match(policies[0].qual,/owner_id.*auth.uid/s);
    }
    for (const name of functions) {
      const signature=`public.${name}(uuid,uuid,text,jsonb,integer,jsonb)`;
      const fn=(await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
      assert.equal(fn.prosecdef,false); assert.deepEqual(fn.proconfig,['search_path=""']);
      for (const role of ['service_role','anon','authenticated'])
        assert.equal((await db.query('select has_function_privilege($1,$2,$3) allowed',[role,signature,'EXECUTE'])).rows[0].allowed,false);
    }
  } finally { await db.close(); }
});
