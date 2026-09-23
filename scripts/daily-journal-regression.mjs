import test from 'node:test';import assert from 'node:assert/strict';import load from './helpers/load-ts.cjs';
const {readDailyJournal,readDailyJournalEntry,saveDailyJournal,canAttachJournalTrade}=load('src/lib/dailyJournal.ts');
test('a journal entry persists and detaches its trade link without losing legacy notes',()=>{
 const key='cova-daily-journal-v1:Tradovate%3A71:a';
 data.set(key,JSON.stringify({'2026-09-18':'Original note'}));
 assert.equal(typeof readDailyJournalEntry,'function');
 assert.deepEqual(readDailyJournalEntry('a','Tradovate:71','2026-09-18'),{note:'Original note',tradeId:null});
 assert(saveDailyJournal('a','Tradovate:71','2026-09-18','Review the exit','trade-1'));
 assert.deepEqual(readDailyJournalEntry('a','Tradovate:71','2026-09-18'),{note:'Review the exit',tradeId:'trade-1'});
 assert.equal(readDailyJournal('a','Tradovate:71','2026-09-18'),'Review the exit');
 assert.deepEqual(readDailyJournalEntry('b','Tradovate:71','2026-09-18'),{note:'',tradeId:null});
 assert.deepEqual(readDailyJournalEntry('a','Tradovate:72','2026-09-18'),{note:'',tradeId:null});
 assert(saveDailyJournal('a','Tradovate:71','2026-09-18','Keep the note',null));
 assert.deepEqual(readDailyJournalEntry('a','Tradovate:71','2026-09-18'),{note:'Keep the note',tradeId:null});
});
test('attachment IDs must resolve uniquely inside the selected account',()=>{
 assert.equal(typeof canAttachJournalTrade,'function');
 const a={id:'a',source:{provider:'Tradovate',accountId:'71'}},b={id:'b',source:{provider:'Tradovate',accountId:'72'}};
 assert.equal(canAttachJournalTrade([a,b],'Tradovate:71','a'),true);
 assert.equal(canAttachJournalTrade([a,b],'Tradovate:71','b'),false);
 assert.equal(canAttachJournalTrade([a,b],'Tradovate:71','deleted'),false);
 assert.equal(canAttachJournalTrade([a,{...b,id:'a'}],'all','a'),false);
 assert.equal(canAttachJournalTrade([a,b],'all','b'),true);
 assert.equal(canAttachJournalTrade([a,b],'Tradovate:71',null),true);
});
const data=new Map();globalThis.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
test('journal saves real notes per owner/account/date, not global or broker records',()=>{
 assert(saveDailyJournal('a','Tradovate:71','2026-09-18','Wait for the retest.'));assert.equal(readDailyJournal('a','Tradovate:71','2026-09-18'),'Wait for the retest.');assert.equal(readDailyJournal('b','Tradovate:71','2026-09-18'),'');assert.equal(readDailyJournal('a','Tradovate:72','2026-09-18'),'');assert.equal(readDailyJournal('a','Tradovate:71','2026-09-19'),'');assert.equal(saveDailyJournal('a','all','2026-02-30','x'),false);assert.equal(saveDailyJournal('','all','2026-09-18','x'),false);assert.equal(saveDailyJournal('a','all','2026-09-18','x'.repeat(2001)),false);
});
