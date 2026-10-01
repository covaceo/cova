// Runs the observed TEST function against a disposable in-memory database only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;`);
for (const name of ["20261001003225_isolated_workspace_sync.sql","20261001003802_workspace_service_grants.sql","20261001005212_workspace_batch_manifest.sql"])
 await db.exec(readFileSync(new URL("./fixtures/workspace-contract/"+name,import.meta.url),"utf8"));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
await db.query("insert into auth.users(id) values($1),($2)",[A,B]);
await db.query(
  "insert into workspace_settings(owner_id,disclosure_version) values ($1,$3),($2,$3)",
  [A, B, "workspace-cloud-v1"],
);
const row = (id, revision = 0, note = "a", deleted = false) => ({
  kind: "daily_note",
  recordId: JSON.stringify(["local", id]),
  accountId: "local",
  schemaVersion: 1,
  payload: deleted ? {} : { date: id, note, tradeId: null },
  expectedRevision: revision,
  deleted,
});
const apply = (
  owner,
  rows,
  id = crypto.randomUUID(),
  hash = "a".repeat(64),
  migration = null,
) =>
  db.query(
    "select cova_apply_workspace($1,$2,$3,$4::jsonb,null,$5::jsonb) as result",
    [owner, id, hash, JSON.stringify(rows), JSON.stringify(migration)],
  );
test("atomic CAS rollback, A/B separation, replay, and tombstone behavior", async () => {
  const id = crypto.randomUUID();
  const first = await apply(A, [row("2026-10-01")], id);
  assert.deepEqual(await apply(A, [row("2026-10-01")], id), first);
  await assert.rejects(
    apply(A, [row("2026-10-01")], id, "b".repeat(64)),
    /operation_id_reused/,
  );
  await apply(B, [row("2026-10-01", 0, "B")]);
  await assert.rejects(
    apply(A, [row("2026-10-02"), row("2026-10-01", 0, "stale")]),
    /revision_conflict/,
  );
  assert.equal(
    (
      await db.query(
        "select * from workspace_records where owner_id=$1 and record_id=$2",
        [A, row("2026-10-02").recordId],
      )
    ).rows.length,
    0,
  );
  await apply(A, [row("2026-10-01", 1, "", true)]);
  await assert.rejects(
    apply(A, [row("2026-10-01", 2, "revived")]),
    /deleted_record/,
  );
  assert.equal(
    (
      await db.query(
        "select payload from workspace_records where owner_id=$1",
        [B],
      )
    ).rows[0].payload.note,
    "B",
  );
});
test("partial batch marker blocks other writes until original batch completes", async () => {
  const backupId = crypto.randomUUID();
  const metadata = {
    backupId,
    contentHash: "c".repeat(64),
    totalBatches: 2,
    totalChanges: 501,
    batch: 0,
  };
  const records = Array.from({ length: 500 }, (_, i) => ({
    ...row("unused"),
    recordId: "batch-" + i,
  }));
  await apply(A, records, crypto.randomUUID(), "d".repeat(64), metadata);
  const pending = (
    await db.query(
      "select pending_manifest from workspace_settings where owner_id=$1",
      [A],
    )
  ).rows[0].pending_manifest;
  assert.equal(pending.nextBatch, 1);
  await assert.rejects(apply(A, [row("2026-10-03")]), /incomplete_other_batch/);
  await apply(
    A,
    [{ ...row("unused"), recordId: "batch-500" }],
    crypto.randomUUID(),
    "e".repeat(64),
    { ...metadata, batch: 1 },
  );
  assert.equal(
    (
      await db.query(
        "select pending_manifest from workspace_settings where owner_id=$1",
        [A],
      )
    ).rows[0].pending_manifest,
    null,
  );
});
test("atomic plan rolls back an early chunk when a later chunk conflicts", async () => {

  await db.exec(
    readFileSync(
      new URL("../docs/workspace-atomic-plan.sql", import.meta.url),
      "utf8",
    ),
  );
  const rows = Array.from({ length: 500 }, (_, i) => ({
    ...row("unused"),
    recordId: "atomic-" + i,
  }));
  rows.push(row("2026-10-01", 0, "stale"));
  const run = (values, id = crypto.randomUUID()) =>
    db.query(
      "select cova_apply_workspace_plan($1,$2,$3,$4::jsonb,null,null) as result",
      [B, id, "f".repeat(64), JSON.stringify(values)],
    );
  await assert.rejects(run(rows), /revision_conflict/);
  assert.equal(
    (
      await db.query(
        "select count(*)::integer as n from workspace_records where record_id like 'atomic-%'",
      )
    ).rows[0].n,
    0,
  );
  rows[500] = row("2026-10-01", 1, "new");
  const id = crypto.randomUUID();
  const result = await run(rows, id);
  assert.equal(result.rows[0].result.records.length, 501);
  assert.deepEqual(await run(rows, id), result);
  assert.equal(
    (
      await db.query(
        "select pending_manifest from workspace_settings where owner_id=$1",
        [B],
      )
    ).rows[0].pending_manifest,
    null,
  );
});
const planApply = (owner, rows, max = null, id = crypto.randomUUID()) => db.query(
 "select cova_apply_workspace_plan($1,$2,$3,$4::jsonb,$5,null) as result",
 [owner,id,"a".repeat(64),JSON.stringify(rows),max]);
test("daily note clear/sync/re-enter is explicit CAS; stale edits/deletes and trade revival fail", async()=>{
 const date="2026-12-01";
 await planApply(B,[row(date)]);
 await planApply(B,[row(date,1,"",true)]);
 await assert.rejects(planApply(B,[row(date,2,"implicit")]),/deleted_record/);
 await assert.rejects(planApply(B,[{...row(date,1,"stale"),recreateDailyNote:true}]),/revision_conflict/);
 const recreated={...row(date,2,"re-entered"),recreateDailyNote:true};
 const id=crypto.randomUUID();const receipt=await planApply(B,[recreated],null,id);
 assert.equal(receipt.rows[0].result.records[0].revision,3);
 assert.equal(receipt.rows[0].result.records[0].payload.note,"re-entered");
 assert.deepEqual(await planApply(B,[recreated],null,id),receipt);
 await assert.rejects(planApply(B,[row(date,1,"stale edit")]),/revision_conflict/);
 await assert.rejects(planApply(B,[row(date,2,"",true)]),/revision_conflict/);
 await planApply(B,[row("2026-12-02")]);await planApply(B,[row("2026-12-02",1,"",true)]);
 await assert.rejects(planApply(B,[{...row("2026-12-02",2,"recreate"),recreateDailyNote:true},row(date,0,"conflict")]),/revision_conflict/);
 const rolledBack=(await db.query("select revision,deleted_at from workspace_records where owner_id=$1 and record_id=$2",[B,row("2026-12-02").recordId])).rows[0];
 assert.equal(Number(rolledBack.revision),2);assert(rolledBack.deleted_at);
 const trade={...row("trade-revival"),kind:"trade",recordId:"trade-revival",payload:{id:"trade-revival"}};
 await planApply(B,[trade]);await planApply(B,[{...trade,payload:{},deleted:true,expectedRevision:1}]);
 await assert.rejects(planApply(B,[{...trade,expectedRevision:2,recreateDailyNote:true}]),/invalid_daily_note_recreation/);
 await assert.rejects(planApply(B,[{...trade,expectedRevision:2}]),/deleted_record/);
});
test("trade cap uses final atomic state independent of chunk order, preserves downgrade and rollback",async()=>{
 const make=(id,rev=0,deleted=false)=>({...row(id),kind:"trade",recordId:id,payload:deleted?{}:{id},expectedRevision:rev,deleted});
 for(const deletionFirst of [false,true]){
  const owner=crypto.randomUUID();
  await db.query("insert into auth.users(id) values($1)",[owner]);
  await db.query("insert into workspace_settings(owner_id,disclosure_version) values($1,'workspace-cloud-v1')",[owner]);
  await planApply(owner,Array.from({length:25},(_,i)=>make("old-"+i)),25);
  const notes=Array.from({length:499},(_,i)=>({...row("unused"),recordId:"cap-note-"+i}));
  const deletion=make("old-0",1,true),addition=make("new");
  await planApply(owner,deletionFirst?[deletion,...notes,addition]:[addition,...notes,deletion],25);
  assert.equal((await db.query("select count(*)::int n from workspace_records where owner_id=$1 and kind='trade' and deleted_at is null",[owner])).rows[0].n,25);
  await assert.rejects(planApply(owner,[make("excess"),...notes.map(x=>({...x,expectedRevision:1}))],25),/trade_cap_exceeded/);
  assert.equal((await db.query("select count(*)::int n from workspace_records where owner_id=$1 and record_id='excess'",[owner])).rows[0].n,0);
  await planApply(owner,[make("pro-extra")],null);
  await planApply(owner,[make("new",1)],25); // downgrade permits unchanged count
  await assert.rejects(planApply(owner,[make("downgrade-growth")],25),/trade_cap_exceeded/);
 }
});
test("exact contract keeps owner-read RLS and service-only write/recreation privileges",async()=>{
 await db.exec("set role authenticated");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
 const own=await db.query("select owner_id from workspace_records");assert(own.rows.every(r=>r.owner_id===A));
 await assert.rejects(db.exec("update workspace_records set deleted_at=null"),/permission denied/);
 await assert.rejects(planApply(A,[row("2026-12-20")]),/permission denied/);
 await db.exec("reset role;set role anon");
 await assert.rejects(db.exec("select * from workspace_records"),/permission denied/);
 await db.exec("reset role;set role service_role");
 await planApply(A,[row("2026-12-20")]);await planApply(A,[row("2026-12-20",1,"",true)]);
 await planApply(A,[{...row("2026-12-20",2,"service recreation"),recreateDailyNote:true}]);
 await db.exec("reset role");
});
test.after(() => db.close());
