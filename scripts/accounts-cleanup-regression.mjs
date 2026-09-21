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
const base={brokerBusy:false,brokerNotice:'',brokerStatus:null,canRedirectToTradovate:()=>true,checkTradovateStatus:noop,disconnectBroker:noop,entitlements:{canUseDirectSync:true,plan:'pro',maxStoredTrades:1000,maxTradesPerImport:1000},openFirmOAuth:noop,rithmicAvailable:true,rithmicBusy:false,rithmicStatusChecked:true,tradovateAvailable:true,tradovateStatusChecked:true,selectedFirmId:'rithmic',setBrokerNotice:noop,setSelectedFirmId:noop,startTradovateConnect:noop,syncBusy:false,syncRithmic:noop,syncTradovate:noop,upgradeToPro:noop};
test('CSV starts empty, never with a preloaded fake trade',()=>{
 const html=renderToStaticMarkup(React.createElement(ImportDesk,{entitlements:base.entitlements,importCsv:noop,prepareImportCsv:()=>null,openFirmOAuth:noop,status:'',reset:noop,upgradeToPro:noop}));
 assert.doesNotMatch(html,/Smoke row/);assert.match(html,/<textarea[^>]*><\/textarea>/);
});
test('Accounts offers only Tradovate and NinjaTrader; CSV help is platform-neutral',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerConnectPanel,base));
 assert.match(html,/NinjaTrader/);assert.match(html,/Tradovate/);
 assert.doesNotMatch(html,/Rithmic|TopstepX|Apex|MFFU|Tradeify|Other firm|atomic nonce|API gated|Choose a source/);
 assert.match(html,/Sign in with Tradovate/);assert.match(html,/Upload CSV/);assert.doesNotMatch(html,/type="password"/);
 const guide=renderToStaticMarkup(React.createElement(CsvExportGuide,{selectedFirmId:'rithmic',setSelectedFirmId:noop}));
 assert.doesNotMatch(guide,/Rithmic|TopstepX|Apex|MFFU|Tradeify/);
});
test('Retained Tradovate connections can disconnect while unavailable, never sync or reconnect',()=>{
 const html=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,tradovateAvailable:false,brokerStatus:{provider:'Tradovate',connected:true}}));
 assert.match(html,/Disconnect/);assert.match(html,/Sync unavailable/);assert.doesNotMatch(html,/>Sync trades</);assert.doesNotMatch(html,/Sign in with Tradovate/);
});
test('Active connections retain sync; non-Pro accounts cannot start a connection',()=>{
 const connected=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,brokerStatus:{provider:'Tradovate',connected:true}}));
 assert.match(connected,/Sync trades/);assert.match(connected,/Disconnect/);
 const free=renderToStaticMarkup(React.createElement(BrokerConnectPanel,{...base,entitlements:{...base.entitlements,canUseDirectSync:false,plan:'free'}}));
 assert.doesNotMatch(free,/Sign in with Tradovate/);assert.match(free,/Pro/);assert.match(free,/Upload CSV/);
});
