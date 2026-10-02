import test from "node:test";
import assert from "node:assert/strict";
import load from "./helpers/load-ts.cjs";
const { assertValue, assertWrites, assertRecords } = load(
  "src/lib/workspaceValidation.ts",
);
const batches = load("src/lib/workspaceBatches.ts");
const owner = "11111111-1111-4111-8111-111111111111";
const trade = (id = "manual-1") => ({
  id,
  date: "2026-10-01",
  market: "ES",
  side: "Long",
  contracts: 1,
  entry: 100,
  exit: 101,
  pnl: 25,
  risk: 0,
  riskStatus: "missing",
  setup: "",
  notes: "",
  manual: { accountKey: "local", currency: "USD", pnlBasis: "reported_net" },
});
const value = (id = "manual-1") => ({
  kind: "trade",
  recordId: id,
  accountId: "local",
  schemaVersion: 1,
  payload: trade(id),
});
const write = (id = "manual-1") => ({
  ...value(id),
  expectedRevision: 0,
  deleted: false,
});
const data = new Map();
globalThis.localStorage = {
  getItem: (k) => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v),
  removeItem: (k) => data.delete(k),
};
const meta = { backupId: owner, contentHash: "a".repeat(64) };
test("payload boundary preserves explicit manual net, rejects credentials/media/forged source metadata", () => {
  assertValue(value());
  assert.equal(value().payload.manual.pnlBasis, "reported_net");
  for (const bad of [
    { ...trade(), access_token: "do-not-upload" },
    { ...trade(), picture: "data:image/png;base64,AAA" },
    { ...trade(), manual: { ...trade().manual, verified: true } },
    { ...trade(), source: { provider: "Tradovate", accountId: "7" } },
  ])
    assert.throws(() => assertValue({ ...value(), payload: bad }));
  assert.throws(() => assertWrites([{ ...write(), owner: "another-owner" }]));
  assert.throws(() => assertValue({ ...value(), accountId: "all" }));
});
test("daily notes require exact account/date identity and valid dates", () => {
  const note = {
    kind: "daily_note",
    recordId: '["local","2026-10-01"]',
    accountId: "local",
    schemaVersion: 1,
    payload: { date: "2026-10-01", note: "A", tradeId: null },
  };
  assertValue(note);
  assert.throws(() => assertValue({ ...note, accountId: "all" }));
  assert.throws(() =>
    assertValue({ ...note, payload: { ...note.payload, date: "2026-02-30" } }),
  );
});
test("unsupported cash uploads and malformed server snapshots fail closed", () => {
  assert.throws(() =>
    assertWrites([
      {
        kind: "broker_cash",
        recordId: "Tradovate:7",
        accountId: "Tradovate:7",
        schemaVersion: 1,
        payload: { cash: {}, fingerprint: "x" },
        deleted: false,
        expectedRevision: 0,
      },
    ]),
  );
  assert.throws(() =>
    assertRecords([
      {
        ...value(),
        revision: 0,
        createdAt: "x",
        updatedAt: "x",
        deletedAt: null,
      },
    ]),
  );
});
test("interrupted 501-row migration resumes same operation ID and complete manifest", async () => {
  data.clear();
  const plan = batches.prepareWorkspaceBatches(
    owner,
    Array.from({ length: 501 }, (_, i) => write("manual-" + i)),
    meta,
  );
  const calls = [];
  let lost = true;
  const client = {
    apply: async (id, records, migration) => {
      calls.push({ id, records, migration });
      if (lost) {
        lost = false;
        throw Error("lost response");
      }
      return { records: [] };
    },
  };
  await assert.rejects(
    batches.sendWorkspaceBatches(owner, client, () => true),
    /lost/,
  );
  assert.equal(batches.readWorkspaceBatchPlan(owner).next, 0);
  await batches.sendWorkspaceBatches(owner, client, () => true);
  assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[1].records.length, 501);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].migration.backupId, owner);
  assert.equal(batches.readWorkspaceBatchPlan(owner).next, 2);
  batches.finishWorkspaceBatches(owner);
  assert.equal(batches.readWorkspaceBatchPlan(owner), null);
});
test("account switch stops queued writes without deleting persisted recovery state", async () => {
  data.clear();
  batches.prepareWorkspaceBatches(owner, [write()], meta);
  let calls = 0;
  await assert.rejects(
    batches.sendWorkspaceBatches(
      owner,
      {
        apply: async () => {
          calls++;
          return { records: [] };
        },
      },
      () => false,
    ),
  );
  assert.equal(calls, 0);
  assert(batches.readWorkspaceBatchPlan(owner));
});
test("quota failure starts no network work; browser cannot replace an unfinished operation", () => {
  data.clear();
  const set = localStorage.setItem;
  localStorage.setItem = () => {
    throw Error("quota");
  };
  assert.throws(
    () => batches.prepareWorkspaceBatches(owner, [write()], meta),
    /quota/,
  );
  localStorage.setItem = set;
  batches.prepareWorkspaceBatches(owner, [write()], meta);
  assert.throws(
    () => batches.prepareWorkspaceBatches(owner, [write("manual-2")], meta),
    /Resume/,
  );
});

test('migration collection preserves IDs, scope and exact originals; excludes unrelated storage',async()=>{
 data.clear();const {collectWorkspaceLocal,saveWorkspaceBackup}=load('src/lib/workspaceLocal.ts');
 localStorage.key=i=>[...data.keys()][i]??null;Object.defineProperty(localStorage,'length',{configurable:true,get:()=>data.size});
 const ledger='cova-react-risk-os-v2:'+owner,raw=JSON.stringify({trades:[trade()],rules:[]});data.set(ledger,raw);data.set('unrelated-private-setting','synthetic-not-a-secret');
 const snapshot=await collectWorkspaceLocal(owner,[trade()],[]);assert.equal(snapshot.records.find(r=>r.kind==='trade').recordId,'manual-1');assert.equal(snapshot.legacyValues[ledger],raw);assert(!('unrelated-private-setting' in snapshot.legacyValues));
 const backup=await saveWorkspaceBackup(owner,snapshot);assert(backup.backupId);assert.equal(data.get(ledger),raw);assert.equal(data.get('unrelated-private-setting'),'synthetic-not-a-secret');
});
test('ambiguous local trade identities stop migration instead of deduplicating',async()=>{
 const {stableWorkspaceTrades}=load('src/lib/workspaceLocal.ts');await assert.rejects(stableWorkspaceTrades([trade(),{...trade(),pnl:999}]),/Duplicate trade identity/);
});

test("definitive rejected plan is archived and rebuildable; ambiguous failures retain exact replay",async()=>{
 data.clear();const first=batches.prepareWorkspaceBatches(owner,Array.from({length:26},(_,i)=>write("manual-repair-"+i)),meta);
 await assert.rejects(batches.sendWorkspaceBatches(owner,{apply:async()=>{throw Object.assign(Error("cap"),{definitiveRejection:true,status:422});}},()=>true),/cap/);
 assert.equal(batches.readWorkspaceBatchPlan(owner),null);
 assert([...data.keys()].some(k=>k.includes(":rejected:")));
 const next=batches.prepareWorkspaceBatches(owner,Array.from({length:25},(_,i)=>write("manual-repair-"+i)),meta);
 assert.notEqual(next.batches[0].id,first.batches[0].id);
 const attempts=[];
 await assert.rejects(batches.sendWorkspaceBatches(owner,{apply:async(id,rows)=>{attempts.push({id,rows});throw Error("lost response");}},()=>true),/lost response/);
 await batches.sendWorkspaceBatches(owner,{apply:async(id,rows)=>{attempts.push({id,rows});return {records:[]};}},()=>true);
 assert.deepEqual(attempts[0],attempts[1]);
});

test("snapshot restart discards partial rows and rejects cross-owner or truncated pages",async()=>{
 const {readCompleteWorkspace}=load("src/lib/workspaceSnapshot.ts");
 const make=(note)=>({...value(),payload:{...trade(),notes:note},revision:1,createdAt:"2026-10-01T00:00:00Z",updatedAt:"2026-10-01T00:00:00Z",deletedAt:null});
 const encode=r=>Buffer.from(JSON.stringify(r)+"\n").toString("base64");
 let restarted=false;
 const result=await readCompleteWorkspace(owner,async cursor=>{
  if(cursor.offset && !restarted){restarted=true;throw Object.assign(Error("changed"),{status:409});}
  return {owner,consent:true,revision:restarted?2:1,pendingWrite:null,chunk:cursor.offset?"":encode(make(restarted?"new":"old")),next:cursor.offset?null:{offset:1,byteOffset:0}};
 });
 assert.equal(result.records.length,1);assert.equal(result.records[0].payload.notes,"new");
 await assert.rejects(readCompleteWorkspace(owner,async()=>({owner:"other",consent:true,revision:1,chunk:"",next:null})),/Invalid/);
 await assert.rejects(readCompleteWorkspace(owner,async()=>({owner,consent:true,revision:1,chunk:Buffer.from('{"kind":').toString("base64"),next:null})),/Incomplete/);
});
