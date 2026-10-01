import load from "./helpers/load-ts.cjs";
const {readCompleteWorkspace}=load("src/lib/workspaceSnapshot.ts");
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
const { createWorkspaceHandler, WorkspaceOperationRejection } = await import(pathToFileURL(file));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  operationId = "33333333-3333-4333-8333-333333333333";
const rawRequest = async (handler, { method = "GET", owner = A, body, cursor = {} } = {}) => {
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
  await handler({ method, url: "/api/workspace?owner=" + owner + "&" + new URLSearchParams(cursor), body }, res);
  return { status, payload };
};
const request = async (handler, options={}) => {
 if(options.method && options.method!=="GET") return rawRequest(handler,options);
 try {
  return {status:200,payload:await readCompleteWorkspace(options.owner||A,async cursor=>{
   const response=await rawRequest(handler,{...options,cursor});
   if(response.status!==200) throw Object.assign(Error(response.payload.error),{status:response.status});
   return response.payload;
  })};
 } catch(e){return {status:e.status,payload:{error:e.message}};}
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

test("large valid workspace restores via bounded revision-consistent pages",async()=>{
 const rows=Array.from({length:2100},(_,i)=>{
  const d=new Date(Date.UTC(2020,0,i+1)).toISOString().slice(0,10);
  return {...record(d),payload:{date:d,note:"x".repeat(2000),tradeId:null}};
 });
 const h=handler(async(path,o)=>path==="workspace_settings"?[{disclosure_version:"workspace-cloud-v1",revision:1,pending_manifest:null}]:rows.slice(Number(o.query.offset),Number(o.query.offset)+Number(o.query.limit)));
 let pages=0;
 const result=await readCompleteWorkspace(A,async cursor=>{
  const r=await rawRequest(h,{cursor});assert.equal(r.status,200);
  assert(Buffer.byteLength(JSON.stringify(r.payload))<1500000);pages++;return r.payload;
 });
 assert.equal(result.records.length,2100);assert(pages>8);
 assert.equal(result.records[2099].payload.note,"x".repeat(2000));
});
test("fragmented multibyte record is decoded only after complete snapshot; revision change restarts",async()=>{
 const large={kind:"broker_cash",record_id:"Tradovate:7",account_id:"Tradovate:7",schema_version:1,payload:{cash:{},fingerprint:"€".repeat(600000)},revision:1,created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z",deleted_at:null};
 const h=handler(async(path,o)=>path==="workspace_settings"?[{disclosure_version:"workspace-cloud-v1",revision:1,pending_manifest:null}]:(Number(o.query.offset)===0?[large]:[]));
 const r=await request(h);assert.equal(r.status,200);assert.equal(r.payload.records[0].payload.fingerprint.length,600000);
});

test("20000-deletion receipt is compact even when internal SQL receipt exceeds platform response budget",async()=>{
 const writes=Array.from({length:20000},(_,i)=>({...write,recordId:"receipt-"+i,payload:{},deleted:true,expectedRevision:1}));
 const records=writes.map(r=>({...r,revision:2,createdAt:"2026-10-01T00:00:00.123456Z",updatedAt:"2026-10-01T00:00:00.123456Z",deletedAt:"2026-10-01T00:00:00.123456Z"}));
 for(const r of records){delete r.expectedRevision;delete r.deleted;}
 assert(Buffer.byteLength(JSON.stringify(records))>4500000);
 const h=handler(async()=>({operationId,records}));
 const r=await request(h,{method:"POST",body:{owner:A,action:"apply",operationId,records:writes}});
 assert.equal(r.status,200);assert.equal(r.payload.applied,true);assert.equal(r.payload.operationId,operationId);
 assert(Buffer.byteLength(JSON.stringify(r.payload))<1000);
});
test("only attested atomic rejection returns the matching rejected operation identity",async()=>{
 const body={owner:A,action:"apply",operationId,records:[write]};
 const rejected=await request(handler(async()=>{throw new WorkspaceOperationRejection(422,"cap",operationId,"trade_cap_exceeded")}),{method:"POST",body});
 assert.equal(rejected.status,422);assert.equal(rejected.payload.rejectedOperationId,operationId);
 const unknown=await request(handler(async()=>{throw Error("response lost after commit")}),{method:"POST",body});
 assert.equal(unknown.status,500);assert.equal(unknown.payload.rejectedOperationId,undefined);
});
