import type { RiskRule, Trade } from './risk';
export function progressAccount(trade:Trade){return trade.source?.provider==='Tradovate'?`Tradovate:${trade.source.accountId}`:trade.source?.provider==='Rithmic'?`Rithmic:${trade.source.accountKey}:${trade.source.accountId}`:trade.manual?.accountKey||'local'}
export const PROGRESS_RULES = ['maxDailyLoss','maxTradeLoss','maxContracts','maxLossStreak'] as const;
export type ProgressLimits = Record<typeof PROGRESS_RULES[number],number|null>;
export type ProgressPlan = {id:number;created_at:string;limits:ProgressLimits};
export type ProgressEvidence = {day:string;account:string;firstEntry:string;netCents:number|null;asOf:string|null;entries:{pnlCents:number;contracts:number;openedAt:string;closedAt:string}[]};
export type ProgressQuote = {xp:number;reason:string;rulesHeld:boolean;kind:'green'|'red'|'flat'|'unavailable'};
export type ProgressReceipt = {owner_id:string;account_key:string;session_day:string;xp:number;note:string;revision:number;evidence_hash:string;evidence_as_of:string|null;reason:string;updated_at:string};
export type ProgressState = {owner_id:string;total_xp:number;receipts:ProgressReceipt[]};
export function progressLimits(rules:readonly RiskRule[]):ProgressLimits {
 return Object.fromEntries(PROGRESS_RULES.map(metric=>{const matches=rules.filter(r=>r.metric===metric&&r.enabled);const rule=matches.length===1?matches[0]:null;return [metric,rule&&Number.isFinite(rule.limit)&&rule.limit>0?rule.limit:null]})) as ProgressLimits;
}
export function progressLevel(xp:number){if(!Number.isSafeInteger(xp)||xp<0)throw Error('Invalid progress');return {level:Math.floor(xp/100)+1,within:xp%100,target:100};}
export function evaluatePassportProgress(e:ProgressEvidence,plan:ProgressPlan|null):ProgressQuote {
 const unavailable=(reason:string):ProgressQuote=>({xp:0,reason,rulesHeld:false,kind:'unavailable'});
 if(!e.entries.length)return unavailable('Import a trading session to review.');
 if(!plan||!Number.isFinite(Date.parse(plan.created_at))||Date.parse(plan.created_at)>Date.parse(e.firstEntry))return unavailable('Limits must be saved before the session starts.');
 if(PROGRESS_RULES.some(key=>!Number.isFinite(plan.limits[key])||Number(plan.limits[key])<=0))return unavailable('Set all four risk limits before trading to earn XP.');
 if(e.netCents===null||!Number.isSafeInteger(e.netCents))return unavailable('Sync reconciled after-fee history to earn XP.');
 let cumulative=0,losses=0,lastLoss='';
 for(const trade of [...e.entries].sort((a,b)=>a.closedAt.localeCompare(b.closedAt))){
  if(!Number.isSafeInteger(trade.pnlCents)||!Number.isSafeInteger(trade.contracts)||trade.contracts<=0)return unavailable('This session needs complete trade evidence.');
  // Stopping at the streak limit is compliant; taking a new entry after it is not.
  const enteredAfterStop=losses>=plan.limits.maxLossStreak!&&trade.openedAt>=lastLoss;
  cumulative+=trade.pnlCents;
  if(enteredAfterStop||trade.contracts>plan.limits.maxContracts!||trade.pnlCents < -Math.round(plan.limits.maxTradeLoss!*100)||cumulative < -Math.round(plan.limits.maxDailyLoss!*100))return unavailable('Risk limits need review.');
  if(trade.pnlCents<0){losses++;lastLoss=trade.closedAt}else if(trade.pnlCents>0)losses=0;
 }
 if(e.netCents < -Math.round(plan.limits.maxDailyLoss!*100))return unavailable('Risk limits need review.');
 return {xp:e.netCents>0?60:15,reason:'',rulesHeld:true,kind:e.netCents>0?'green':e.netCents<0?'red':'flat'};
}
