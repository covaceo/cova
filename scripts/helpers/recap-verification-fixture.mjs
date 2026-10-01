// Synthetic server envelope; no network or credentials. Also injected into browser tests.
export function recapSyncFixture(rows) {
 const header='date,market,side,contracts,entry,exit,pnl,risk,setup,notes,sourceProvider,sourceAccountId,sourceTradeId,sourceOpenedAt,sourceClosedAt,sourceTimeZone,sourcePnlBasis';
 const accounts=[...new Set(rows.map(t=>t.source.accountId))].map(id=>{
  const trades=rows.filter(t=>t.source.accountId===id).map(t=>({...t,date:t.source.closedAt,risk:0,setup:'Imported',notes:'',source:{provider:'Tradovate',accountId:id,openedAt:t.source.openedAt,closedAt:t.source.closedAt,timeZone:'UTC',pnlBasis:'gross_before_fees'}}));
  return {account:{id,name:'Synthetic '+id},status:'ready',counts:{trades:trades.length},trades,csv:[header,...trades.map(t=>[t.date,t.market,t.side,t.contracts,t.entry,t.exit,t.pnl,0,'Imported','','Tradovate',id,t.id,t.source.openedAt,t.source.closedAt,'UTC','gross_before_fees'].join(','))].join('\n')};
 });
 return {status:'history_ready',provider:'Tradovate',coverage:'bounded_matched_fill_pairs',pnlBasis:'gross_before_fees',window:{startDate:'2026-09-01',endDate:'2026-09-30',timeZone:'UTC',timezoneOffset:0},accounts};
}
