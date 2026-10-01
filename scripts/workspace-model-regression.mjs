// Pure local tests of NEW code; does not contact TEST or production.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = stripTypeScriptTypes(
  readFileSync(
    new URL("../src/lib/workspaceModel.ts", import.meta.url),
    "utf8",
  ),
);
const {
  recreateDailyNote,
  workspaceKey,
  workspaceEqual,
  workspacePreview,
  workspaceDiff,
  mergeWorkspaceReceipt,
} = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
);
const value = (id = "a", account = "local", note = "original") => ({
  kind: "trade",
  recordId: id,
  accountId: account,
  schemaVersion: 1,
  payload: { id, notes: note },
});
const record = (v = value(), revision = 1, deletedAt = null) => ({
  ...v,
  revision,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: `2026-10-01T00:00:0${revision}Z`,
  deletedAt,
});

test("same-date all/local journal notes remain separate and independently editable", () => {
  const note = (account) => ({
    kind: "daily_note",
    recordId: JSON.stringify([account, "2026-10-01"]),
    accountId: account,
    schemaVersion: 1,
    payload: { date: "2026-10-01", note: account },
  });
  const all = note("all"),
    local = note("local");
  assert.notEqual(workspaceKey(all), workspaceKey(local));
  assert.deepEqual(
    workspaceDiff(
      [all, { ...local, payload: { ...local.payload, note: "edited" } }],
      [record(all), record(local)],
      true,
    ),
    [
      {
        ...local,
        payload: { ...local.payload, note: "edited" },
        expectedRevision: 1,
        deleted: false,
      },
    ],
  );
});
test("partial/failed loading cannot turn an empty snapshot into mass deletion", () => {
  assert.throws(() => workspaceDiff([], [record()], false), /incomplete/);
  assert.throws(() => workspaceDiff([], [record()]), /incomplete/);
});
test("remote-only data is a review item, not an implicit deletion", () => {
  assert.deepEqual(workspacePreview([], [record()]), {
    added: [],
    conflicts: [],
    matching: 0,
    cloudOnly: 1,
  });
});
test("confirmed complete edit/delete snapshot carries exact expected revisions", () => {
  const rows = [record(value("a"), 3), record(value("b"), 2)];
  const writes = workspaceDiff([value("a", "local", "edited")], rows, true);
  assert.equal(writes[0].expectedRevision, 3);
  assert.deepEqual(writes[1], {
    kind: "trade",
    recordId: "b",
    accountId: "local",
    schemaVersion: 1,
    payload: {},
    expectedRevision: 2,
    deleted: true,
  });
  assert.equal(rows[0].payload.notes, "original");
});
test("deletion cannot be silently resurrected by stale device state", () => {
  const deleted = record(value(), 4, "2026-10-01T00:00:04Z");
  assert.equal(workspacePreview([value()], [deleted]).conflicts.length, 1);
  assert.throws(() => workspaceDiff([value()], [deleted], true), /Deleted/);
  assert.throws(
    () => mergeWorkspaceReceipt([deleted], [record(value(), 5)]),
    /revive/,
  );
});
test("lost-response replay never replaces a newer edit or tombstone", () => {
  const newest = record(value("a", "local", "new"), 5);
  assert.deepEqual(mergeWorkspaceReceipt([newest], [record(value(), 2)]), [
    newest,
  ]);
  const deleted = { ...newest, deletedAt: newest.updatedAt, payload: {} };
  assert.deepEqual(mergeWorkspaceReceipt([deleted], [record(value(), 2)]), [
    deleted,
  ]);
});
test("ambiguous duplicate identities and immutable trade account changes fail closed", () => {
  assert.throws(
    () => workspacePreview([value(), value("a", "other")], []),
    /Duplicate/,
  );
  assert.throws(
    () => workspaceDiff([value("a", "other")], [record()], true),
    /account/,
  );
  assert.throws(
    () => mergeWorkspaceReceipt([record()], [record(value("a", "other"), 2)]),
    /account/,
  );
});
test("equal revision with different contents is rejected", () => {
  assert.throws(
    () =>
      mergeWorkspaceReceipt(
        [record()],
        [record(value("a", "local", "changed"))],
      ),
    /Inconsistent/,
  );
  assert.deepEqual(mergeWorkspaceReceipt([record()], [record()]), [record()]);
});
test("JSON object ordering does not create false conflicts; array ordering still matters", () => {
  assert(
    workspaceEqual(value(), {
      ...value(),
      payload: { notes: "original", id: "a" },
    }),
  );
  assert(
    !workspaceEqual(
      { ...value(), payload: { list: [1, 2] } },
      { ...value(), payload: { list: [2, 1] } },
    ),
  );
  assert.throws(
    () => workspaceEqual({ ...value(), payload: { number: NaN } }, value()),
    /JSON/,
  );
});
test("receipt merge preserves unrelated rows, isolates returned objects, and rejects unsafe revisions", () => {
  const baseline = [record(value("b"))],
    incoming = [record(value("a"), 2)];
  const result = mergeWorkspaceReceipt(baseline, incoming);
  assert.equal(result.length, 2);
  result[1].payload.notes = "mutated";
  assert.equal(incoming[0].payload.notes, "original");
  assert.throws(
    () =>
      mergeWorkspaceReceipt([], [record(value(), Number.MAX_SAFE_INTEGER + 1)]),
    /revision/,
  );
});

test("daily note clear/re-enter requires explicit exact-version recreation; trades cannot revive", () => {
  const note = {kind:"daily_note",recordId:'["local","2026-10-01"]',accountId:"local",schemaVersion:1,payload:{date:"2026-10-01",note:"again",tradeId:null}};
  const deleted = record({...note,payload:{}},2,"2026-10-01T00:00:02Z");
  assert.equal(workspaceDiff([], [record(note)], true)[0].deleted, true);
  assert.throws(()=>workspaceDiff([note],[deleted],true), /Deleted/);
  assert.equal(workspacePreview([note],[deleted]).conflicts.length,1);
  assert.deepEqual(recreateDailyNote(note,deleted), {...note,expectedRevision:2,deleted:false,recreateDailyNote:true});
  assert.throws(()=>recreateDailyNote(value(),record(value(),2,deleted.deletedAt)),/Only/);
  const recreated=record(note,3);
  assert.deepEqual(mergeWorkspaceReceipt([deleted],[recreated]),[recreated]);
  assert.deepEqual(mergeWorkspaceReceipt([recreated],[deleted]),[recreated]);
});
