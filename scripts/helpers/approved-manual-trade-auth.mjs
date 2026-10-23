import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const deltas=JSON.parse(readFileSync(new URL('../fixtures/manual-trade-auth-approved.json',import.meta.url),'utf8'));
export function withoutManualTradeAuth(source) {
 let restored=source.toString().replaceAll('\r\n','\n');
 if(!restored.includes('import { ManualTradeAuth }'))return restored;
 for(const delta of deltas){assert.equal(restored.split(delta.new).length,2,'Exact approved manual-trade refresh delta');restored=restored.replace(delta.new,delta.old);}
 return restored;
}
