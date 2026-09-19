// Observed Cash History CSV contract. Cash movements are NOT per-fill fee allocations.
const HEADER = 'Account,Transaction ID,Timestamp,Date,Delta,Amount,Cash Change Type,Currency,Contract';
const FEES = new Set(['Exchange Fee', 'Clearing Fee', 'Nfa Fee', 'Commission', 'Brokerage Fee', 'IP Fee', 'Order Routing Fee']);
const fail = () => { throw new Error('invalid_cash_report'); };
function cents(value) {
  if (typeof value !== 'string' || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d{2}$/.test(value)) fail();
  const n = Number(BigInt(value.replaceAll(',', '').replace('.', '')));
  if (!Number.isSafeInteger(n) || Math.abs(n) > 1e14) fail();
  return n;
}
function fields(line) {
  const result = []; let part = '', quoted = false, closed = false;
  for (let i=0;i<line.length;i++) {
    const c=line[i];
    if (quoted) { if(c==='"' && line[i+1]==='"'){part+='"';i++;} else if(c==='"'){quoted=false;closed=true;} else part+=c; }
    else if(c===','){result.push(part);part='';closed=false;}
    else if(c==='"' && !part && !closed) quoted=true;
    else if(c==='"' || closed) fail(); else part+=c;
  }
  if(quoted) fail(); result.push(part); return result;
}
export function parseCashHistory(text, account, window, trades) {
  if (typeof text !== 'string' || Buffer.byteLength(text)>524288 || !text.endsWith('\n') || !account?.id || !account.name || window?.timeZone!=='UTC' || window.timezoneOffset!==0) fail();
  const lines=text.replace(/^\uFEFF/,'').split(/\r*\n/).filter(line=>line!=='');
  if(lines[0]!==HEADER || lines.length>5001) fail();
  const entries=lines.slice(1).map(line=>{
    const row=fields(line); if(row.length!==9 || row[0]!==account.name || !/^[1-9]\d{0,19}$/.test(row[1]) || row[7]!=='USD') fail();
    const m=/^(\d{2})\/(\d{2})\/(20\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(row[2]); if(!m) fail();
    const at=`${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
    if(!Number.isFinite(Date.parse(at)) || new Date(at).toISOString()!==at || at<`${window.startDate}T00:00:00.000Z` || at>=`${window.endDate}T00:00:00.000Z`) fail();
    const type=row[6].trim();
    return {id:row[1],at,deltaCents:cents(row[4]),balanceCents:cents(row[5]),type,category:type==='Trade Paired'?'trade':FEES.has(type)?'fee':type==='Fund Transaction'?'funding':'other',currency:'USD',contract:row[8]};
  });
  const seen=new Set(); let previous;
  for(const e of entries) {
    if(seen.has(e.id) || e.category==='other' || previous && (e.at<previous.at || previous.balanceCents+e.deltaCents!==e.balanceCents)) fail();
    seen.add(e.id);previous=e;
  }
  const sum=values=>{const n=values.reduce((a,b)=>a+BigInt(b),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))fail();return Number(n);};
  const grossCents=sum(entries.filter(e=>e.category==='trade').map(e=>e.deltaCents));
  const feeCents=sum(entries.filter(e=>e.category==='fee').map(e=>e.deltaCents));
  const nonTradingCents=sum(entries.filter(e=>e.category==='funding'||e.category==='other').map(e=>e.deltaCents));
  const tradeGross=sum(trades.map(t=>{const n=t.pnl*100;if(!Number.isFinite(n)||Math.abs(n-Math.round(n))>1e-6)fail();return Math.round(n);}));
  if(grossCents!==tradeGross) fail();
  return {status:'reconciled',version:1,accountId:account.id,currency:'USD',window:{startDate:window.startDate,endDate:window.endDate},grossCents,feeCents,netCents:sum([grossCents,feeCents]),nonTradingCents,openingBalanceCents:entries.length?entries[0].balanceCents-entries[0].deltaCents:null,closingBalanceCents:entries.at(-1)?.balanceCents??null,entries,asOf:new Date().toISOString(),basis:'cash_movements_no_trade_allocation'};
}
