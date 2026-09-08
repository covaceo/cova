import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(process.argv[2] || `${root}/dist-astra-export`);
await mkdir(destination, {recursive:true});
await cp(`${root}/dist-astra-preview`, destination, {recursive:true});
// This bootstrap exists only in the disposable preview export, never in the app entry or canonical build.
await writeFile(`${destination}/review-entry.js`, `(() => {
  const marker = 'cova-astra-review-opened-v1';
  try {
    if (!localStorage.getItem(marker)) {
      if (!localStorage.getItem('cova-auth-session-v1')) localStorage.setItem('cova-auth-session-v1', JSON.stringify({email:'dev@cova.local',source:'local-preview',mode:'login',plan:'pro',subscriptionStatus:'preview',signedInAt:new Date().toISOString()}));
      localStorage.setItem(marker,'true');
    }
  } catch { /* Existing explicit Dev preview action remains available. */ }
  if (!location.hash) history.replaceState(null,'',location.pathname+location.search+'#dashboard');
})();\n`);
const html = await readFile(`${destination}/index.html`,'utf8');
await writeFile(`${destination}/index.html`,html.replace('<head>','<head><meta name="robots" content="noindex,nofollow"><script src="/review-entry.js"></script>'));
const original = JSON.parse(await readFile(`${root}/vercel.json`,'utf8'));
await writeFile(`${destination}/vercel.json`,JSON.stringify({version:2,framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',headers:[...original.headers,{source:'/(.*)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]},null,2));
console.log(`Preview-only static export: ${destination}`);
