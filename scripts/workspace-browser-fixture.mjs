// Disposable local UI/transport fixture. No Supabase/Vercel network requests.
import { createServer, build } from "vite";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const built = await build({
  configFile: false,
  logLevel: "error",
  ssr: { noExternal: true },
  build: { ssr: "api/workspace.ts", target: "node22", write: false },
});
const dir = mkdtempSync(join(tmpdir(), "cova-sync-browser-"));
writeFileSync(join(dir, "api.mjs"), built.output[0].code);
const { createWorkspaceHandler, WorkspaceOperationRejection } = await import(
  pathToFileURL(join(dir, "api.mjs"))
);
const db = new PGlite();
await db.exec(
  `create table workspace_settings(owner_id uuid primary key,disclosure_version text,revision bigint default 0,pending_manifest jsonb);create table workspace_records(owner_id uuid,kind text,record_id text,account_id text,schema_version integer,payload jsonb,revision bigint,created_at timestamptz default clock_timestamp(),updated_at timestamptz default clock_timestamp(),deleted_at timestamptz,primary key(owner_id,kind,record_id));create table workspace_operations(owner_id uuid,operation_id uuid,content_hash text,receipt jsonb,created_at timestamptz default clock_timestamp(),primary key(owner_id,operation_id));`,
);
await db.exec(readFileSync("scripts/fixtures/workspace-test-rpc.sql", "utf8"));
await db.exec(
  "create role anon;create role authenticated;create role service_role;",
);
await db.exec(readFileSync("docs/workspace-atomic-plan.sql", "utf8"));
let offline = false;
const rest = async (path, o) => {
  if (offline)
    throw Object.assign(Error("Synthetic offline"), { statusCode: 503 });
  if (path === "workspace_settings") {
    if (o.body) {
      await db.query(
        "insert into workspace_settings(owner_id,disclosure_version) values ($1,$2) on conflict do nothing",
        [o.body.owner_id, o.body.disclosure_version],
      );
      return [];
    }
    return (
      await db.query(
        "select disclosure_version,revision,pending_manifest from workspace_settings where owner_id=$1",
        [o.query.owner_id.slice(3)],
      )
    ).rows;
  }
  if (path === "workspace_records")
    return JSON.parse(
      JSON.stringify(
        (
          await db.query(
            "select * from workspace_records where owner_id=$1 order by kind,record_id limit $2 offset $3",
            [
              o.query.owner_id.slice(3),
              Number(o.query.limit),
              Number(o.query.offset),
            ],
          )
        ).rows,
      ),
    );
  const b = o.body;
  try {
    return (
      await db.query(
        "select cova_apply_workspace_plan($1,$2,$3,$4::jsonb,$5,$6::jsonb) as result",
        [
          b.p_owner,
          b.p_operation,
          b.p_hash,
          JSON.stringify(b.p_records),
          b.p_max_trades,
          JSON.stringify(b.p_migration),
        ],
      )
    ).rows[0].result;
  } catch (e) {
    if (["revision_conflict","deleted_record","trade_cap_exceeded"].includes(e.message))
      throw new WorkspaceOperationRejection(e.message==="trade_cap_exceeded"?422:409,e.message,b.p_operation,e.message);
    throw e;
  }
};
const handler = createWorkspaceHandler({
  enabled: () => true,
  auth: async (req) => ({
    id: String(req.headers.authorization || "").replace("Bearer qa-", ""),
    plan: "pro",
  }),
  rest,
});
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{useWorkspaceSync,WorkspaceSyncPanel}from'/src/components/WorkspaceSync.tsx';import{MiniJournal}from'/src/components/MiniJournal.tsx';import{readDailyJournalEntry,saveDailyJournal}from'/src/lib/dailyJournal.ts';import{setActiveStorageIdentity}from'/src/lib/storageScope.ts';import{defaultRules}from'/src/lib/risk.ts';import{persistTradingLedger}from'/src/lib/recapVerification.ts';
window.__owner=new URLSearchParams(location.search).get('owner')||'11111111-1111-4111-8111-111111111111';setActiveStorageIdentity(window.__owner);
function App(){const[owner,setOwner]=useState(window.__owner),[trades,setTrades]=useState(()=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)||'{}').trades||[]),[rules,setRules]=useState(()=>JSON.parse(localStorage.getItem('cova-react-risk-os-v2:'+owner)||'{}').rules||defaultRules),[account,setAccount]=useState('all');const sync=useWorkspaceSync(owner,trades,rules,(t,r)=>{setTrades(t);setRules(r);});
React.useEffect(()=>{if(sync.allowEdit)persistTradingLedger('cova-react-risk-os-v2:'+owner,JSON.stringify({trades,rules,tradeAccount:account}));},[owner,trades,rules,account,sync.allowEdit]);
window.__sync=sync;window.__rows=trades;window.__rules=rules;window.__setNote=note=>setTrades(t=>t.map(r=>({...r,notes:note})));window.__switchOwner=o=>{window.__owner=o;setActiveStorageIdentity(o);setOwner(o);setTrades([]);setRules(defaultRules);};
return <><WorkspaceSyncPanel sync={sync}/><fieldset disabled={!sync.allowEdit}><select aria-label='Trade account' value={account} onChange={e=>{if(window.dispatchEvent(new Event('cova:before-account-change',{cancelable:true})))setAccount(e.target.value);}}><option value='all'>All accounts</option><option value='local'>CSV / local history</option></select><button onClick={()=>setTrades(t=>[...t,{id:'manual-'+crypto.randomUUID(),date:'2026-10-01',market:'ES',side:'Long',contracts:1,entry:100,exit:101,pnl:25,risk:0,riskStatus:'missing',setup:'',notes:'Trade A',manual:{accountKey:'local',currency:'USD',pnlBasis:'reported_net'}}])}>Add synthetic trade</button><button onClick={()=>setRules(r=>r.map(x=>x.metric==='maxDailyLoss'?{...x,limit:1250}:x))}>Set loss limit</button><MiniJournal key={owner+account} initialDate='2026-10-01' trades={trades} actions={{draftKey:JSON.stringify([owner,account]),read:date=>readDailyJournalEntry(owner,account,date).note,readEntry:date=>readDailyJournalEntry(owner,account,date),save:(date,n,id)=>saveDailyJournal(owner,account,date,n,id)}}/></fieldset><output id='rows'>{JSON.stringify(trades)}</output><output id='phase'>{sync.phase}</output></>};createRoot(document.getElementById('root')).render(<App/>);`;
writeFileSync("scripts/.workspace-fixture.tsx", entry);
const server = await createServer({
  configFile: false,
  define: { "import.meta.env.VITE_WORKSPACE_SYNC_ENABLED": '"true"' },
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
  plugins: [
    {
      name: "local-workspace-fixture",
      enforce: "pre",
      load(id) {
        if (id.endsWith("/src/lib/supabaseClient.ts"))
          return readFileSync("src/lib/supabaseClient.ts","utf8").replace("export function getSupabaseClient() {","function unusedRealSupabaseClient() {").replace("export function getSupabaseAuthSessionId(accessToken: string)","function unusedRealSessionId(accessToken: string)") + `
export const getSupabaseAuthSessionId=()=>"qa-session";
export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__qaSession||{user:{id:window.__owner},access_token:'qa-'+window.__owner}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}});`;
      },
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/api/workspace")) {
            let body = "";
            for await (const chunk of req) body += chunk;
            req.body = body;
            res.status = (n) => {
              res.statusCode = n;
              return res;
            };
            res.json = (x) => {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(x));
            };
            return handler(req, res);
          }
          if (req.url === "/__offline") {
            offline = !offline;
            res.end(String(offline));
            return;
          }
          if (req.url?.startsWith("/__workspace")) {
            res.setHeader("Content-Type", "text/html");
            res.end(
              '<div id="root"></div><script type="module" src="/scripts/.workspace-fixture.tsx"></script>',
            );
            return;
          }
          next();
        });
      },
    },
  ],
});
await server.listen();
console.log("LOCAL_WORKSPACE_FIXTURE http://127.0.0.1:4179/__workspace");
