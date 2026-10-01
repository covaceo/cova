// Runs the observed TEST function against a disposable in-memory database only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  `create table workspace_settings(owner_id uuid primary key,disclosure_version text,revision bigint default 0,pending_manifest jsonb);create table workspace_records(owner_id uuid,kind text,record_id text,account_id text,schema_version integer,payload jsonb,revision bigint,created_at timestamptz default clock_timestamp(),updated_at timestamptz default clock_timestamp(),deleted_at timestamptz,primary key(owner_id,kind,record_id));create table workspace_operations(owner_id uuid,operation_id uuid,content_hash text,receipt jsonb,created_at timestamptz default clock_timestamp(),primary key(owner_id,operation_id));`,
);
await db.exec(
  readFileSync(
    new URL("./fixtures/workspace-test-rpc.sql", import.meta.url),
    "utf8",
  ),
);
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
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
    "create role anon;create role authenticated;create role service_role;",
  );
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
test.after(() => db.close());
