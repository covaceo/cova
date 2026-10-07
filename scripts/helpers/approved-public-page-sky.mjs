import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const changes=JSON.parse(readFileSync(new URL('../fixtures/public-page-sky-approved-changes.json',import.meta.url),'utf8'));
export function restoreApprovedPublicSkySource(path,source){
 const crlf=source.includes('\r\n');let s=source.replaceAll('\r\n','\n');const deltas=changes[path]||[];
 if(!deltas.some(c=>s.includes(c.new)))return source;
 for(const c of deltas){assert.equal(s.split(c.new).length,2,'Exactly one authorized public sky delta: '+path);s=s.replace(c.new,c.old)}
 return crlf?s.replaceAll('\n','\r\n'):s;
}
