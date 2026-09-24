import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
let panels,ImportDesk;
try { panels=await server.ssrLoadModule('/src/components/ImportPanels.tsx'); ({ImportDesk}=await server.ssrLoadModule('/src/components/ImportDesk.tsx')); } finally { await server.close(); }
const {BrokerConnectPanel,CsvExportGuide}=panels;
const noop=()=>{};
const base={brokerBusy:false,brokerNotice:'',brokerStatus:null,canRedirectToTradovate:()=>true,checkTradovateStatus:noop,disconnectBroker:noop,entitlements:{canUseDirectSync:true,plan:'pro',maxStoredTrades:1000,maxTradesPerImport:1000},openFirmOAuth:noop,rithmicAvailable:true,rithmicBusy:false,rithmicStatusChecked:true,tradovateAvailable:true,tradovateStatusChecked:true,selectedFirmId:'other',setBrokerNotice:noop,setSelectedFirmId:noop,startTradovateConnect:noop,syncBusy:false,syncRithmic:noop,syncTradovate:noop,upgradeToPro:noop};
test('CSV starts empty, never with a preloaded fake trade',()=>{
 const html=renderToStaticMarkup(React.createElement(ImportDesk,{entitlements:base.entitlements,importCsv:noop,prepareImportCsv:()=>null,openFirmOAuth:noop,status:'',reset:noop,upgradeToPro:noop}));
 assert.doesNotMatch(html,/Smoke row/);assert.match(html,/<textarea[^>]*><\/textarea>/);
});
test('Accounts offers shared Tradovate / NinjaTrader and Rithmic connections; CSV help is platform-neutral',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerConnectPanel,base));
 assert.match(html,/>Tradovate \/ NinjaTrader</);assert.match(html,/>Rithmic</);
 assert.doesNotMatch(html,/TopstepX|Apex|MFFU|Tradeify|Other firm|atomic nonce|API gated|Choose a source|data-platform="ninjatrader"/);
 assert.match(html,/Connect Tradovate/);assert.match(html,/Connect Rithmic/);assert.doesNotMatch(html,/type="password"/);
 const guide=renderToStaticMarkup(React.createElement(CsvExportGuide,{selectedFirmId:'rithmic',setSelectedFirmId:noop}));
 assert.doesNotMatch(guide,/Rithmic|TopstepX|Apex|MFFU|Tradeify/);
});
test('Rithmic login opens only with verified availability and Pro; provider notices remain visible',()=>{
 const open={...base,selectedFirmId:'rithmic'};
 const html=renderToStaticMarkup(React.createElement(BrokerConnectPanel,open));
 assert.match(html,/data-rithmic-connect/);assert.match(html,/type="password"/);
 assert.match(html,/data-rithmic-attribution/);assert.match(html,/not stored/);assert.match(html,/before commissions/);
 for(const override of [{rithmicAvailable:false},{rithmicStatusChecked:false},{entitlements:{...base.entitlements,canUseDirectSync:false}}]){
  const gated=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...open,...override}));
  assert.doesNotMatch(gated,/type="password"|data-rithmic-connect/);
 }
});
test('Rithmic sync disables competing Tradovate actions',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,rithmicBusy:true,brokerStatus:{provider:'Tradovate',connected:true}}));
 const tradovate=html.split('data-platform="tradovate"')[1].split('</article>')[0];
 const buttons=[...tradovate.matchAll(/<button\b[^>]*>Sync trades<\/button>/g),...html.matchAll(/<button\b[^>]*>Refresh status<\/button>/g)].map(m=>m[0]);
 assert.equal(buttons.length,2);assert.ok(buttons.every(b=>b.includes('disabled')));
});
test('Retained Tradovate connections can disconnect while unavailable, never sync or reconnect',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,tradovateAvailable:false,brokerStatus:{provider:'Tradovate',connected:true}}));
 assert.match(html,/Disconnect/);assert.match(html,/Sync unavailable/);assert.doesNotMatch(html,/>Sync trades</);assert.doesNotMatch(html,/Connect Tradovate/);
});
test('Active connections retain sync; non-Pro accounts cannot start a connection',()=>{
 const connected=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,brokerStatus:{provider:'Tradovate',connected:true}}));
 assert.match(connected,/Sync trades/);assert.match(connected,/Disconnect/);
 const free=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,entitlements:{...base.entitlements,canUseDirectSync:false,plan:'free'}}));
 assert.doesNotMatch(free,/Connect Tradovate/);assert.match(free,/Pro/);assert.doesNotMatch(free,/type="password"/);
});
