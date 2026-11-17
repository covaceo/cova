// Observed Orders/Fills identity only. Latest order versions are NOT chronology.
// Deliberately independent of Performance import/risk semantics; shared with preview validation.
const ORDER_HEADERS='orderId,Account,Order ID,B/S,Contract,Product,Product Description,avgPrice,filledQty,Fill Time,lastCommandId,Status,_priceFormat,_priceFormatType,_tickSize,spreadDefinitionId,Version ID,Timestamp,Date,Quantity,Text,Type,Limit Price,Stop Price,decimalLimit,decimalStop,Filled Qty,Avg Fill Price,decimalFillAvg,Venue,Notional Value,Currency'.split(',');
const FILL_HEADERS='_id,_orderId,_contractId,_timestamp,_tradeDate,_action,_qty,_price,_active,_accountId,Fill ID,Order ID,Timestamp,Date,Account,B/S,Quantity,Price,_priceFormat,_priceFormatType,_tickSize,Contract,Product,Product Description,commission'.split(',');
const fail=reason=>{throw Object.assign(new Error(reason),{reason});};
function table(text,headers){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>131072)fail('invalid_historical_csv');
  const records=[];let row=[],value='',quoted=false,closed=false;
  const field=()=>{row.push(value);value='';closed=false;};
  const line=()=>{field();records.push(row);row=[];if(records.length>4001)fail('historical_row_limit');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'&&text[i+1]==='"'){value+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else value+=c;}
    else if(c===',')field();
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;line();}
    else if(c==='"'&&!value&&!closed)quoted=true;
    else if(c==='"'||closed)fail('invalid_historical_csv');
    else value+=c;
  }
  if(quoted)fail('invalid_historical_csv');
  if(value||closed||row.length)line();
  const keys=records.shift();
  if(!keys||keys.length!==headers.length||new Set(keys).size!==keys.length||headers.some(h=>!keys.includes(h)))fail('invalid_historical_csv');
  return records.map(r=>{if(r.length!==keys.length)fail('invalid_historical_csv');return Object.fromEntries(keys.map((k,i)=>[k,r[i]]));});
}
const mismatch=()=>fail('historical_identity_mismatch');
const id=v=>{if(typeof v!=='string'||!/^[1-9]\d{0,18}$/.test(v)||BigInt(v)>9223372036854775807n)mismatch();return v;};
function decimal(v){
  if(typeof v!=='string'||! /^-?\d{1,10}(?:\.\d{1,10})?$/.test(v)||Math.abs(Number(v))>1e9)mismatch();
  const n=v.replace(/^(-?)0+(?=\d)/,'$1').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
  return /^-?0$/.test(n)?'0':n;
}
const quantity=v=>{decimal(v);if(!Number.isSafeInteger(Number(v))||Number(v)<=0||Number(v)>100000)mismatch();return Number(v);};
function utc(v){
  if(typeof v!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,19)!==v.slice(0,19))mismatch();
  return `${v.slice(0,19)}.${(v.split('.')[1]?.slice(0,-1)||'').padEnd(9,'0')}Z`;
}
function displayTime(v){
  const m=/^(\d{2})\/(\d{2})\/(20\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(v);
  if(!m)mismatch();return utc(`${m[3]}-${m[1]}-${m[2]}T${m[4]}Z`);
}
const displayDate=v=>`${v.slice(5,7)}/${v.slice(8,10)}/${v.slice(2,4)}`;
const side=v=>{const s=v.trim();if(!['Buy','Sell'].includes(s))mismatch();return s;};
export function validateDetailContracts(reports){
  const types={startDate:'Date',endDate:'Date',startTime:'Time',endTime:'Time',account:'accounts',contract:'contracts',product:'products',exchange:'exchanges',order:'orders'};
  for(const name of ['Order Details','Position History']){
    const matches=reports.filter(r=>r.name===name);
    if(matches.length!==1)fail(matches.length?'ambiguous_report_contract':'missing_report_contract');
    const params=matches[0].params,supplied=name==='Order Details'?['order']:['startDate','endDate','startTime','endTime','account'];
    if(!supplied.every(k=>params.some(p=>p.name===k)))fail('missing_report_contract');
    if(new Set(params.map(p=>p.name)).size!==params.length)fail('ambiguous_report_contract');
    for(const p of params){
      if(Object.hasOwn(types,p.name)&&p.paramType!==types[p.name])fail('unsupported_parameter_type');
      if(typeof p.optional!=='boolean'||!supplied.includes(p.name)&&!p.optional||name==='Order Details'&&p.name==='order'&&p.optional)fail('unsupported_required_parameter');
    }
  }
}
export function matchHistoricalIdentity(ordersText,fillsText,selection,accountName,window){
  const orders=table(ordersText,ORDER_HEADERS),fills=table(fillsText,FILL_HEADERS);
  if(orders.length+fills.length>4000)fail('historical_row_limit');
  if(orders.length>24)fail('historical_order_limit');
  const pair=/^tradovate-([1-9]\d*):([1-9]\d*):([1-9]\d*)$/.exec(selection.tradeId);
  if(!pair||id(pair[1])!==id(selection.accountId)||id(pair[2])===id(pair[3])||!['Long','Short'].includes(selection.side)||fills.length!==2)mismatch();
  const buy=fills.find(f=>f._id===pair[2]),sell=fills.find(f=>f._id===pair[3]);
  if(!buy||!sell)mismatch();
  const entry=selection.side==='Long'?buy:sell,exit=selection.side==='Long'?sell:buy;
  const contract=entry.Contract,cid=id(entry._contractId);
  if(!/^[A-Z0-9]{1,12}[FGHJKMNQUVXZ]\d{1,4}$/.test(contract)||selection.contractSymbol!==undefined&&selection.contractSymbol!==contract)mismatch();
  const within=t=>{if(t.slice(0,10)<window.startDate||t.slice(0,10)>=window.endDate)mismatch();};
  const orderIds=new Set(),fillIds=new Set();
  for(const o of orders){
    if(orderIds.has(id(o.orderId))||id(o['Order ID'])!==o.orderId||o.Account!==accountName||o.Contract!==contract)mismatch();
    orderIds.add(o.orderId);id(o.lastCommandId);id(o['Version ID']);side(o['B/S']);quantity(o.Quantity);
    const t=displayTime(o.Timestamp);within(t);if(o.Date!==displayDate(t))mismatch();
    if(!['Canceled','Completed','Expired','Filled','PendingCancel','PendingNew','PendingReplace','Rejected','Suspended','Unknown','Working'].includes(o.Status.trim()))mismatch();
    decimal(o._priceFormat);decimal(o._priceFormatType);if(Number(decimal(o._tickSize))<=0)mismatch();
    for(const [a,b] of [['decimalStop','Stop Price'],['decimalLimit','Limit Price'],['decimalFillAvg','Avg Fill Price'],['decimalFillAvg','avgPrice'],['filledQty','Filled Qty']]){
      if((o[a]==='')!==(o[b]==='')||o[a]!==''&&decimal(o[a])!==decimal(o[b]))mismatch();
    }
    if(!['Market','Limit','Stop'].includes(o.Type.trim())||o.Type.trim()!=='Stop'&&o.decimalStop!=='')fail('unsupported_historical_order_type');
    if(o.Type.trim()==='Stop'&&o.decimalStop===''||o.Type.trim()==='Limit'&&o.decimalLimit==='')mismatch();
    if(o.filledQty!==''){
      if(quantity(o.filledQty)>quantity(o.Quantity)||o.avgPrice===''||!o['Fill Time']||!fills.some(f=>f._orderId===o.orderId)||o.Status.trim()==='Filled'&&quantity(o.filledQty)!==quantity(o.Quantity))mismatch();
      within(displayTime(o['Fill Time']));
    }else if(o.avgPrice!==''||o['Fill Time']!==''||o.Status.trim()==='Filled')mismatch();
  }
  for(const f of fills){
    if(fillIds.has(id(f._id))||id(f['Fill ID'])!==f._id||id(f._orderId)!==id(f['Order ID'])||id(f._accountId)!==selection.accountId||f.Account!==accountName||id(f._contractId)!==cid||f.Contract!==contract)mismatch();
    fillIds.add(f._id);
    const expected=f===buy?'Buy':'Sell';
    if(f._active!=='true'||f._action!==(expected==='Buy'?'0':'1')||side(f['B/S'])!==expected||quantity(f._qty)!==quantity(f.Quantity)||quantity(f._qty)!==quantity(String(selection.quantity))||decimal(f._price)!==decimal(f.Price))mismatch();
    const t=utc(f._timestamp.replace(' ','T'));within(t);
    if(displayTime(f.Timestamp).slice(0,19)!==t.slice(0,19)||f.Date!==displayDate(t)||!/^20\d{2}-\d{2}-\d{2}$/.test(f._tradeDate))mismatch();
    utc(`${f._tradeDate}T00:00:00Z`); // Trading date is not necessarily the UTC calendar date.
    decimal(f._priceFormat);decimal(f._priceFormatType);if(Number(decimal(f._tickSize))<=0)mismatch();
    const o=orders.find(o=>o.orderId===f._orderId);
    if(!o||side(o['B/S'])!==expected||o.Status.trim()!=='Filled'||quantity(o.filledQty)!==quantity(f._qty)||decimal(o.avgPrice)!==decimal(f._price)||displayTime(o['Fill Time']).slice(0,19)!==t.slice(0,19))mismatch();
  }
  const openedAt=utc(entry._timestamp.replace(' ','T')),closedAt=utc(exit._timestamp.replace(' ','T'));
  if(openedAt>=closedAt||openedAt.slice(0,19)!==utc(selection.openedAt).slice(0,19)||closedAt.slice(0,19)!==utc(selection.closedAt).slice(0,19)||decimal(entry._price)!==decimal(String(selection.entry))||decimal(exit._price)!==decimal(String(selection.exit)))mismatch();
  const candidateOrderIds=orders.filter(o=>side(o['B/S'])===(selection.side==='Long'?'Sell':'Buy')&&o.Type.trim()==='Stop').map(o=>o.orderId);
  if(candidateOrderIds.length>12)fail('historical_candidate_limit');
  return {contractId:cid,contractSymbol:contract,entryOrderId:entry._orderId,exitOrderId:exit._orderId,buyFillId:buy._id,sellFillId:sell._id,openedAt,closedAt,candidateOrderIds,orderCount:orders.length,fillCount:fills.length};
}
