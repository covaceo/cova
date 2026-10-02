import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const drafts = load('src/lib/journalDrafts.ts');
const storageScope = load('src/lib/storageScope.ts');
function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: n => [...values.keys()][n] ?? null,
    getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)), removeItem: k => values.delete(k) };
}
for (const kind of ['daily', 'trade']) test(`${kind}: another tab's overwrite/save cannot erase a retained draft`, () => {
  globalThis.localStorage = storage();
  const first = storage(), second = storage();
  const scope = JSON.stringify(kind === 'daily' ? [kind, JSON.stringify(['owner-a','local']), '2026-10-01'] : [kind,'owner-a','trade-1']);
  const stale = kind === 'daily' ? {note:'unsaved stale',tradeId:null} : 'unsaved stale';
  const newer = kind === 'daily' ? {note:'new saved',tradeId:null} : 'new saved';
  globalThis.sessionStorage = first;
  assert.equal(drafts.readJournalDraft(scope), null);
  globalThis.sessionStorage = second;
  assert(drafts.saveJournalDraft(scope, stale));
  globalThis.sessionStorage = first;
  assert(drafts.saveJournalDraft(scope, newer));
  drafts.clearJournalDraft(scope);
  globalThis.sessionStorage = second;
  assert.deepEqual(drafts.readJournalDraft(scope), stale); // same session storage survives refresh
  drafts.clearJournalDraft(scope);
  assert.equal(drafts.readJournalDraft(scope), null);
});

test('saving or discarding one tab leaves a different shared recovery draft intact', () => {
  globalThis.localStorage = storage();
  const first = storage(), second = storage(), scope = JSON.stringify(['trade','owner-a','1']);
  globalThis.sessionStorage = first; drafts.saveJournalDraft(scope,'first');
  globalThis.sessionStorage = second; drafts.saveJournalDraft(scope,'second');
  globalThis.sessionStorage = first; drafts.clearJournalDraft(scope);
  assert.equal(drafts.readJournalDraft(scope),null);
  globalThis.sessionStorage = storage();
  assert.equal(drafts.readJournalDraft(scope),'second');
});

test('legacy recovery adopts into a tab; owner/account/date scopes and owner purge remain separate', () => {
  globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
  const a=JSON.stringify(['daily',JSON.stringify(['owner-a','local']),'2026-10-01']);
  const b=JSON.stringify(['daily',JSON.stringify(['owner-b','local']),'2026-10-01']);
  const legacyKey='cova-journal-draft-v1:'+encodeURIComponent(a)+':owner-a';
  localStorage.setItem(legacyKey,JSON.stringify({note:'legacy',tradeId:null}));
  assert.equal(drafts.readJournalDraft(a).note,'legacy');
  localStorage.removeItem(legacyKey);
  assert.equal(drafts.readJournalDraft(a).note,'legacy');
  assert.equal(drafts.readJournalDraft(JSON.stringify(['daily',JSON.stringify(['owner-a','all']),'2026-10-01'])),null);
  assert.equal(drafts.readJournalDraft(JSON.stringify(['daily',JSON.stringify(['owner-a','local']),'2026-10-02'])),null);
  drafts.saveJournalDraft(b,{note:'other owner',tradeId:null});
  storageScope.setActiveStorageIdentity('owner-a'); storageScope.removeCurrentIdentityStorage();
  assert.equal(drafts.readJournalDraft(a),null);
  assert.equal(drafts.readJournalDraft(b).note,'other owner');
});

test('session quota failure reports failure without overwriting another tab recovery', () => {
  globalThis.localStorage=storage(); globalThis.sessionStorage=storage();
  const scope=JSON.stringify(['trade','owner-a','1']);
  drafts.saveJournalDraft(scope,'retained');
  globalThis.sessionStorage={getItem:()=>null,setItem(){throw Error('quota');}};
  assert.equal(drafts.saveJournalDraft(scope,'not persisted'),false);
  globalThis.sessionStorage=storage(); assert.equal(drafts.readJournalDraft(scope),'retained');
});
