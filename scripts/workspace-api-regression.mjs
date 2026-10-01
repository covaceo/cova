import test from "node:test";
import assert from "node:assert/strict";
import { build } from "vite";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const built = await build({
  configFile: false,
  logLevel: "error",
  ssr: { noExternal: true },
  build: {
    ssr: "api/workspace.ts",
    target: "node22",
    write: false,
    rollupOptions: { output: { format: "es", inlineDynamicImports: true } },
  },
});
const dir = await mkdtemp(join(tmpdir(), "cova-workspace-api-"));
const file = join(dir, "api.mjs");
await writeFile(file, built.output[0].code);
const { createWorkspaceHandler } = await import(pathToFileURL(file));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  operationId = "33333333-3333-4333-8333-333333333333";
const request = async (handler, { method = "GET", owner = A, body } = {}) => {
  let status, payload;
  const res = {
    setHeader() {},
    status(n) {
      status = n;
      return this;
    },
    json(p) {
      payload = p;
      return this;
    },
  };
  await handler({ method, url: "/api/workspace?owner=" + owner, body }, res);
  return { status, payload };
};
const record = (id) => ({
  kind: "daily_note",
  record_id: JSON.stringify(["local", id]),
  account_id: "local",
  schema_version: 1,
  payload: { date: id, note: "note", tradeId: null },
  revision: 1,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  deleted_at: null,
});
const write = {
  kind: "daily_note",
  recordId: '["local","2026-10-01"]',
  accountId: "local",
  schemaVersion: 1,
  payload: { date: "2026-10-01", note: "A", tradeId: null },
  expectedRevision: 0,
  deleted: false,
};
const auth = async () => ({ id: A, plan: "free" });
const handler = (rest, options = {}) =>
  createWorkspaceHandler({ auth, rest, enabled: () => true, ...options });
test("disabled API cannot read or write even with a session", async () => {
  let called = false;
  const r = await request(
    handler(
      async () => {
        called = true;
      },
      { enabled: () => false },
    ),
  );
  assert.equal(r.status, 404);
  assert(!called);
});
test("forged owner is rejected before any service storage access", async () => {
  let calls = 0;
  const h = handler(async () => {
    calls++;
  });
  assert.equal((await request(h, { owner: B })).status, 409);
  assert.equal(
    (
      await request(h, {
        method: "POST",
        body: { owner: B, action: "consent", disclosure: "workspace-cloud-v1" },
      })
    ).status,
    409,
  );
  assert.equal(calls, 0);
});
test("authentication failure propagates without reading storage", async () => {
  const r = await request(
    handler(
      () => {
        throw Error("must not call");
      },
      {
        auth: async () => {
          throw Object.assign(Error("Sign in"), { statusCode: 401 });
        },
      },
    ),
  );
  assert.equal(r.status, 401);
});
test("load reads every truncated page and filters every query to verified owner", async () => {
  const pages = [record("2026-10-01"), record("2026-10-02")];
  const seen = [];
  const h = handler(async (path, o) => {
    assert.equal(o.query.owner_id, "eq." + A);
    if (path === "workspace_settings")
      return [
        {
          disclosure_version: "workspace-cloud-v1",
          revision: 2,
          pending_manifest: null,
        },
      ];
    seen.push(o.query.offset);
    return pages.slice(Number(o.query.offset), Number(o.query.offset) + 1);
  });
  const r = await request(h);
  assert.equal(r.status, 200);
  assert.equal(r.payload.records.length, 2);
  assert.deepEqual(seen, ["0", "1", "2"]);
});
test("concurrent revision change retries rather than serving a torn snapshot", async () => {
  let n = 0;
  const h = handler(async (path) =>
    path === "workspace_settings"
      ? [
          {
            disclosure_version: "workspace-cloud-v1",
            revision: ++n,
            pending_manifest: null,
          },
        ]
      : [],
  );
  assert.equal((await request(h)).status, 409);
});
test("incomplete batches never expose partial records", async () => {
  let rows = false;
  const h = handler(async (path) => {
    if (path === "workspace_records") {
      rows = true;
      return [];
    }
    return [
      {
        revision: 1,
        pending_manifest: { id: operationId },
        disclosure_version: "workspace-cloud-v1",
      },
    ];
  });
  const r = await request(h);
  assert.equal(r.status, 200);
  assert(r.payload.pendingWrite);
  assert(!rows);
  assert.deepEqual(r.payload.records, []);
});
test("apply binds owner and entitlement at server, computes hash, rejects secrets", async () => {
  let call;
  const h = handler(async (path, o) => {
    call = { path, ...o };
    return { operationId, records: [] };
  });
  const body = { owner: A, action: "apply", operationId, records: [write] };
  assert.equal((await request(h, { method: "POST", body })).status, 200);
  assert.equal(call.body.p_owner, A);
  assert.equal(call.body.p_max_trades, 25);
  assert.match(call.body.p_hash, /^[a-f0-9]{64}$/);
  assert.equal(call.path, "rpc/cova_apply_workspace_plan");
  assert.equal(
    (await request(h, { method: "POST", body: { ...body, serviceKey: "bad" } }))
      .status,
    400,
  );
});
test("consent is explicit and does not reset revision or overwrite existing setting", async () => {
  let call;
  const h = handler(async (path, o) => {
    call = { path, ...o };
    return [];
  });
  assert.equal(
    (
      await request(h, {
        method: "POST",
        body: { owner: A, action: "consent", disclosure: "wrong" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(h, {
        method: "POST",
        body: { owner: A, action: "consent", disclosure: "workspace-cloud-v1" },
      })
    ).status,
    200,
  );
  assert.equal(
    call.prefer,
    "resolution=ignore-duplicates,return=representation",
  );
  assert(!("revision" in call.body));
});
process.on("exit", () => {
  void rm(dir, { recursive: true, force: true });
});
