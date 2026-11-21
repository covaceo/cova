// Run after the production frontend build; never sends authentication requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {chromium} from 'playwright';
import {workspaceBrowserOptions} from './workspace-browser-support.mjs';
const root=resolve(process.argv[2]||'dist');
await readFile(resolve(root,'index.html'));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.webp':'image/webp'};
const server=createServer(async(req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+sep)){res.writeHead(404).end();return;}try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port;
let browser;try{browser=await chromium.launch({...workspaceBrowserOptions,headless:true});
for(const width of [390,1440]){const context=await browser.newContext({viewport:{width,height:860},reducedMotion:'reduce'});try{
await context.route('**/*',r=>r.request().url().startsWith(origin+'/')&&r.request().method()==='GET'?r.continue():r.abort());
const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/');const signIn=p.getByRole('button',{name:'Sign in',exact:true});if(!await signIn.first().isVisible()){const menu=p.getByRole('button',{name:/open menu|open navigation|toggle menu/i});if(await menu.count())await menu.first().click();}await signIn.filter({visible:true}).first().click({timeout:5000});const dialog=p.getByRole('dialog',{name:'Sign in to Cova',exact:true});await dialog.waitFor({timeout:12000});
const modes=p.locator('.auth-account-tab');assert.equal(await modes.count(),2);
for(const [name,expected] of [['Sign in',['true','false']],['Sign up',['false','true']],['Sign in',['true','false']]]){await modes.filter({hasText:name}).click();await p.getByRole('dialog',{name:name+' to Cova',exact:true}).waitFor();assert.deepEqual(await modes.evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-pressed'))),expected,'assistive technology can distinguish current auth mode');}
assert.deepEqual(errors,[]);console.log('PASS actual sign-in → signup → sign-in at '+width+'px');}finally{await context.close();}}
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
