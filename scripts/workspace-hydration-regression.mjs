import test from "node:test";
import assert from "node:assert/strict";
import load from "./helpers/load-ts.cjs";
const { commitWorkspaceHydration, recoverWorkspaceHydration } = load(
  "src/lib/workspaceHydration.ts",
);
const owner = "11111111-1111-4111-8111-111111111111";
const ledger = "cova-react-risk-os-v2:" + owner,
  aux = "cova-workspace-aux-v1:" + owner,
  cache = "cova-workspace-cache-v2:" + owner,
  recovery = "cova-workspace-hydration-v2:" + owner;
const original = JSON.stringify({
  trades: [],
  rules: [],
  tradeAccount: "local",
});
const data = new Map();
globalThis.window = { dispatchEvent() {} };
const base = {
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v),
  removeItem: (k) => data.delete(k),
  key: (i) => [...data.keys()][i] ?? null,
  get length() {
    return data.size;
  },
};
globalThis.localStorage = base;
const row = {
  kind: "daily_note",
  recordId: '["local","2026-10-01"]',
  accountId: "local",
  schemaVersion: 1,
  payload: { date: "2026-10-01", note: "cloud", tradeId: null },
  revision: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  deletedAt: null,
};
const reset = () => {
  data.clear();
  data.set(ledger, original);
  data.set(aux, "old auxiliary");
  data.set(cache, "old cache");
  globalThis.localStorage = base;
};
test("successful hydration commits ledger/aux/cache together and preserves selected scope", () => {
  reset();
  commitWorkspaceHydration(owner, [row], []);
  assert.equal(JSON.parse(data.get(ledger)).tradeAccount, "local");
  assert.equal(
    JSON.parse(data.get(aux)).notes.local["2026-10-01"].note,
    "cloud",
  );
  assert.equal(JSON.parse(data.get(cache)).records.length, 1);
  assert(!data.has(recovery));
});
test("failure after ledger save restores old values and never advances cache", () => {
  reset();
  let fail = true;
  globalThis.localStorage = {
    ...base,
    setItem(k, v) {
      if (k === aux && fail) {
        fail = false;
        throw Error("quota");
      }
      base.setItem(k, v);
    },
  };
  assert.throws(() => commitWorkspaceHydration(owner, [row], []), /quota/);
  assert.equal(data.get(ledger), original);
  assert.equal(data.get(aux), "old auxiliary");
  assert.equal(data.get(cache), "old cache");
  assert(!data.has(recovery));
});
test("recovery journal survives failed rollback and restores exact originals later", () => {
  reset();
  globalThis.localStorage = {
    ...base,
    setItem(k, v) {
      if (k === aux) throw Error("storage unavailable");
      base.setItem(k, v);
    },
  };
  assert.throws(
    () => commitWorkspaceHydration(owner, [row], []),
    /recovery journal/,
  );
  assert(data.has(recovery));
  globalThis.localStorage = base;
  recoverWorkspaceHydration(owner);
  assert.equal(data.get(ledger), original);
  assert.equal(data.get(aux), "old auxiliary");
  assert.equal(data.get(cache), "old cache");
  assert(!data.has(recovery));
});
test("cannot hydrate when a verified undo journal cannot be persisted", () => {
  reset();
  globalThis.localStorage = {
    ...base,
    setItem() {
      throw Error("quota");
    },
  };
  assert.throws(() => commitWorkspaceHydration(owner, [row], []));
  assert.equal(data.get(ledger), original);
  assert.equal(data.get(cache), "old cache");
});
