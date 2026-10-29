// Local-only full-App production-CSS fixture; no real credentials or account writes.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const load=require('./helpers/load-ts.cjs');
const {sampleTrades,defaultRules}=load('src/lib/risk.ts');
const mode=process.argv[2]||'after';
if(!['before','after'].includes(mode))throw Error('Use before or after');
const out=path.resolve(process.env.MOBILE_MENU_FIT_EVIDENCE||path.join(root,'../menu-evidence'));
mkdirSync(out,{recursive:true});
const owner='11111111-1111-4111-8111-111111111111';
const seed=`(()=>{const owner=${JSON.stringify(owner)};window.__qaSession={user:{id:owner,email:'menu-review@example.invalid',app_metadata:{plan:'pro'}},access_token:'qa-'+owner};localStorage.setItem('cova-auth-session-v1',JSON.stringify({source:'supabase',userId:owner,providerSessionId:'qa-session',plan:'pro',email:'menu-review@example.invalid',signedInAt:new Date().toISOString()}));localStorage.setItem('cova-workspace-mode-v2:'+owner,'local');localStorage.setItem('cova-react-risk-os-v2:'+owner,JSON.stringify({trades:${JSON.stringify(sampleTrades)},rules:${JSON.stringify(defaultRules)},tradeAccount:'local'}));localStorage.setItem('cova-workspace-aux-v1:'+owner,JSON.stringify({version:1,names:{local:'Sample account'},notes:{},cash:{}}));localStorage.setItem('cova-dashboard-range-v1','all');})();`;
const owned=['src/components/Navbar.tsx','src/components/UserProfile.tsx','src/styles/userProfile.css','src/styles/riskDeskControls.css','src/styles/mobileWorkspace.css'];
await build({root,base:'./',configFile:false,envDir:false,logLevel:'warn',plugins:[{name:'mobile-menu-fit-isolated-auth',enforce:'pre',load(id){
 const rel=path.relative(root,id).replaceAll('\\','/');
 if(rel==='src/lib/supabaseClient.ts')return readFileSync(id,'utf8').replace('export function getSupabaseClient() {','function unusedRealSupabaseClient() {').replace('export function getSupabaseAuthSessionId(accessToken: string)','function unusedRealSessionId(accessToken: string)')+'\nexport const getSupabaseAuthSessionId=()=>"qa-session";export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__qaSession}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}});';
 if(rel==='src/lib/profileRepository.ts')return `export const createProfileRepository=()=>({load:async(user_id)=>({user_id,username:'menu_review',avatar_data:null,username_changed_at:'2020-01-01T00:00:00Z'}),save:async()=>{throw Error('Fixture is read only')}});`;
 if(mode==='before'&&owned.includes(rel))return execFileSync('git',['show',`HEAD:${rel}`],{cwd:root,encoding:'utf8'});
 },transformIndexHtml(){return[{tag:'script',children:seed,injectTo:'head-prepend'}];}},react()],define:{'import.meta.env.VITE_WORKSPACE_SYNC_ENABLED':'"true"'},build:{outDir:path.join(out,'site',mode),emptyOutDir:true}});
console.log(`MOBILE_MENU_FIT_BUILT ${mode} ${path.join(out,'site',mode)}`);
