import {restoreApprovedPublicRefreshSource} from './approved-public-page-refresh.mjs';
import {restoreApprovedPublicSkySource} from './approved-public-page-sky.mjs';
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const changes=JSON.parse(readFileSync(new URL('../fixtures/free-packaging-final-approved-changes.json',import.meta.url),'utf8'));
export function restoreApprovedFreePackagingSource(relative,source){let text=restoreApprovedPublicSkySource(relative,restoreApprovedPublicRefreshSource(relative,source.toString())).replaceAll('\r\n','\n');for(const change of [...(changes[relative]||[])].reverse()){assert.equal(text.split(change.after).length-1,1,'Exactly one approved Free packaging delta is required: '+relative);text=text.replace(change.after,change.before);}return text;}
export function applyApprovedFreePackagingSource(relative,source){let text=source.toString().replaceAll('\r\n','\n');for(const change of changes[relative]||[]){assert.equal(text.split(change.before).length-1,1,'The original Free source must remain present: '+relative);text=text.replace(change.before,change.after);}return text;}
