import {restoreApprovedPublicRefreshSource} from './approved-public-page-refresh.mjs';
import {restoreApprovedPublicSkySource} from './approved-public-page-sky.mjs';
import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const changes=JSON.parse(readFileSync(new URL('../fixtures/hero-cta-approved-changes.json',import.meta.url),'utf8'));
export function restoreApprovedHeroCtaSource(path,source){
 source=restoreApprovedPublicSkySource(path,restoreApprovedPublicRefreshSource(path,source));
 const crlf=source.includes('\r\n');let s=source.replaceAll('\r\n','\n');
 for(const c of changes[path]||[]){assert.equal(s.split(c.new).length,2,'Exact approved hero CTA change occurs once: '+path);s=s.replace(c.new,c.old)}
 return crlf?s.replaceAll('\n','\r\n'):s;
}
