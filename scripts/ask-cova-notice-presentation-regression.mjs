import test from 'node:test';
import assert from 'node:assert/strict';
import load from './helpers/load-ts.cjs';
const {askCovaVisibleNotices: visible}=load('src/lib/askCovaNoticePresentation.ts');
const generic=['Saved all range: 2026-10-20 to 2026-10-21; recorded dates, not live broker history.','Saved source completeness does not certify broker truth or field completeness.'];
test('only exact generic templates collapse; original array is never changed',()=>{
 const notices=Object.freeze([...generic,'net: self-reported net.','wins: self-reported net.']);
 assert.deepEqual(visible(notices),['Self-reported net.']);assert.deepEqual(notices,[...generic,'net: self-reported net.','wins: self-reported net.']);
 for(const text of [...generic,'net: self-reported net.'])assert.deepEqual(visible([text+' Unknown qualification.']),[text+' Unknown qualification.']);
});
test('material P&L basis stays concise, unknown basis fails closed',()=>{
 assert.deepEqual(visible(['net: gross, before fees.','wins: gross, before fees.']),['Before fees.']);
 assert.deepEqual(visible(['net: reported P&L, fees unknown.']),['Fees unknown.']);
 assert.deepEqual(visible(['net: self-reported net.','net: gross, before fees.']),['Mixed P&L bases: self-reported net; before fees. Keep these results separate.']);
 assert.deepEqual(visible(['Reported P&L basis: mixed reported bases, fees not reconciled. This is not reconciled broker cash or allocated account fees.']),['Mixed P&L bases; fees are not reconciled.']);
 assert.deepEqual(visible(['risk: self-reported planned risk.']),['Self-reported planned risk.']);
 assert.deepEqual(visible(['risk_value: stored risk value; zero does not establish planned risk.']),['Stored risk; zero does not confirm planned risk.']);
 const unknown='net: future basis with a material warning.';assert.deepEqual(visible([unknown]),[unknown]);
});
test('partial totals, omitted groups, top-k and boundary ties remain visible with exact counts',()=>{
 assert.deepEqual(visible(['leaders: 2 of 7 groups shown after the complete scan; 3 omitted boundary ties. This is not a full-text summary of omitted records.']),['leaders: Showing 2 of 7 groups; 3 equally ranked results are not shown. Omitted records are not summarized.']);
 assert.deepEqual(visible(['rows: 2 of 7 records shown after the complete scan; 0 omitted boundary ties. This is not a full-text summary of omitted records.']),['rows: Showing 2 of 7 records. Omitted records are not summarized.']);
 assert.deepEqual(visible(['risk.mean: 2/3 usable across all matches; incomplete fields (risk_unavailable) also affect omitted groups.']),['risk.mean: only 2 of 3 matches have usable values (planned risk missing); omitted groups are affected too.']);
 assert.deepEqual(visible(['risk.mean: 1/2 usable; incomplete fields are not a complete total.']),['risk.mean: only 1 of 2 values usable; not a complete total.']);
});
test('filtered sequence, drawdown basis and uncertain chronology are never hidden',()=>{
 const sequence='Sequence unit: trade records, not journal groups or completed positions. The sequence uses only matched records after query filters; excluded intervening records do not participate. Recorded dates order different days; same-day records require distinct source closing instants matching their UTC recorded dates. No ID, creation time or storage order breaks ties.';
 assert.deepEqual(visible([sequence]),['Uses matching trade records, not completed positions; filtered-out trades do not count in this sequence.']);
 assert.deepEqual(visible(['Reported drawdown starts at initial zero before the matched range, not your account balance; it excludes price changes while trades were open and is not intratrade drawdown.']),['Drawdown starts from zero, not your account balance; price changes while trades were open are excluded.']);
 assert.deepEqual(visible(['decline: sequence unavailable (unknown_future_reason); no partial path or invented ordering is reported.']),['decline: sequence unavailable (unknown_future_reason); no partial path or invented ordering is reported.']);
});
test('known source scope and missing sequence warnings use plain language without removing their limits',()=>{
 const cases=[
  ['These saved rules are owner-global current configuration, not historical rules in force. Limits have their rule-specific units; no currency is inferred.','Current rules apply across your accounts, not historically. Units vary by rule; currency is not assumed.'],
  ['Passport plans are separate owner-global saved historical limits, not the current workspace rules or broker-certified compliance.','Saved Passport limits apply across your accounts; they are not current rules or verified broker compliance.'],
  ['Passport records describe saved reviews and reward allocation, not independently verified broker outcomes.','Saved reviews and rewards, not verified broker results.'],
  ['Journal groups use validated fill links before query filters; not certified completed positions. Groups may be censored by selected dates.','Linked fills, not confirmed completed positions; date filters can leave groups incomplete.'],
  ['Quoted saved text is self-reported, not verified financial evidence.','Saved text is self-reported, not verified financial evidence.'],
  ['Loss streak is the longest consecutive run of negative reported trade records; zero and positive results reset the run. It is not a completed-position streak or a prediction.','Longest run of losing trade records, not completed positions. Breakeven or a win resets it; this is not a prediction.'],
  ['decline: sequence unavailable (ambiguous_chronology); no partial path or invented ordering is reported.','decline: closing order is unclear; no sequence result is available.'],
 ];
 for(const [original,short] of cases){assert.deepEqual(visible([original]),[short]);assert.deepEqual(visible([original+' Additional limit.']),[original+' Additional limit.']);}
});
test('separate top-k queries retain their identity and unknown reason tokens stay literal',()=>{
 const top=id=>`${id}: 1 of 3 groups shown after the complete scan; 2 omitted boundary ties. This is not a full-text summary of omitted records.`;
 const shown=visible([top('a'),top('b')]);assert.equal(shown.length,2);assert.match(shown[0],/^a: /);assert.match(shown[1],/^b: /);
 assert.deepEqual(visible(['a.mean: 1/2 usable across all matches; incomplete fields (constructor) also affect omitted groups.']),['a.mean: only 1 of 2 matches have usable values (constructor); omitted groups are affected too.']);
});
test('new, currency, missing and unrecognized notices fail closed verbatim',()=>{
 const notices=['__proto__','constructor','Currencies differ: USD and EUR stay separate.','Some currency is unknown; there is no complete total.','net: missing fee information.','Saved all range: altered format; currency unknown.','<script>unknown warning</script>'];
 assert.deepEqual(visible(notices),notices);
});
