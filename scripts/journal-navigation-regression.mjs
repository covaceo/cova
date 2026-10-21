import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const {listDailyJournalEntries,readJournalEditorDate,rememberJournalEditorDate}=load('src/lib/journalNavigation.ts');
const {readDailyJournalEntry,saveDailyJournal}=load('src/lib/dailyJournal.ts');
const data=new Map(),session=new Map();
globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
globalThis.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)};
globalThis.window={dispatchEvent(){}};
test('history lists saved notes and attachment-only entries, newest first, per owner and account',()=>{
 data.clear();
 assert(saveDailyJournal('owner-a','local','2026-05-01','First note'));
 assert(saveDailyJournal('owner-a','local','2026-05-02','', 'trade-a'));
 assert(saveDailyJournal('owner-a','other','2026-05-03','Other account'));
 assert(saveDailyJournal('owner-b','local','2026-05-04','Other owner'));
 assert.deepEqual(listDailyJournalEntries('owner-a','local'),[{date:'2026-05-02',note:'',tradeId:'trade-a'},{date:'2026-05-01',note:'First note',tradeId:null}]);
 assert.equal(listDailyJournalEntries('owner-a','other')[0].note,'Other account');
 assert.equal(listDailyJournalEntries('owner-b','local')[0].note,'Other owner');
 assert.deepEqual(listDailyJournalEntries('', 'local'),[]);
});
test('workspace journal is authoritative; history preserves notes without trades and excludes malformed/empty dates',()=>{
 data.clear();data.set('cova-workspace-aux-v1:owner-a',JSON.stringify({version:1,names:{},cash:{},notes:{local:{'2026-05-03':{note:'No-trade-day reflection',tradeId:null},'2026-02-30':{note:'Invalid'},'2026-05-04':{note:'',tradeId:null}},other:{'2026-05-05':{note:'Other account'}}}}));
 data.set('cova-daily-journal-v1:local:owner-a',JSON.stringify({'2026-05-06':'Retired copy'}));
 assert.deepEqual(listDailyJournalEntries('owner-a','local'),[{date:'2026-05-03',note:'No-trade-day reflection',tradeId:null}]);
 const before=data.get('cova-workspace-aux-v1:owner-a');listDailyJournalEntries('owner-a','local');assert.equal(data.get('cova-workspace-aux-v1:owner-a'),before,'Read-only index');
 assert(saveDailyJournal('owner-a','local','2026-05-03','Edited reflection',null));assert.equal(readDailyJournalEntry('owner-a','local','2026-05-03').note,'Edited reflection');
});
test('remembered date is tab-local, owner/account scoped and rejects invalid dates',()=>{
 session.clear();rememberJournalEditorDate('owner-a/local','2026-05-03');
 assert.equal(readJournalEditorDate('owner-a/local','2026-05-01'),'2026-05-03');
 assert.equal(readJournalEditorDate('owner-b/local','2026-05-01'),'2026-05-01');
 assert.equal(readJournalEditorDate('owner-a/other','2026-05-01'),'2026-05-01');
 rememberJournalEditorDate('owner-a/local','2026-02-30');assert.equal(readJournalEditorDate('owner-a/local','2026-05-01'),'2026-05-03');
});
