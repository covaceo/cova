/** Code-owned vocabulary: fields, not natural-language topics. */
export type QueryFieldKind='money'|'count'|'percent'|'ratio'|'duration'|'date'|'timestamp'|'price'|'decimal'|'boolean'|'category'|'text';
export type QueryField={kind:QueryFieldKind;type:'decimal'|'text'|'date'|'boolean'|'ref';unit:string|null;untrusted:boolean};
const f=(kind:QueryFieldKind,type:QueryField['type'],unit:string|null=null,untrusted=false):QueryField=>({kind,type,unit,untrusted});
const category=f('category','text'),text=f('text','text',null,true),ref=f('category','ref'),day=f('date','date'),instant=f('timestamp','text'),number=f('decimal','decimal'),count=f('count','decimal','records'),bool=f('boolean','boolean');
const common={record_ref:ref,account_alias:ref,revision:count,created_at:instant,updated_at:instant};
const trade={...common,date:day,recorded_date_text:text,recorded_weekday:category,market:f('category','text',null,true),side:category,contracts:f('decimal','decimal','reported_contracts'),entry_price:f('price','decimal','price'),exit_price:f('price','decimal','price'),reported_pnl:f('money','decimal','reported_pnl'),currency:category,pnl_basis:category,outcome:category,planned_risk:f('money','decimal','planned_risk'),risk_value:f('money','decimal','stored_risk_value'),risk_status:category,risk_available:bool,setup_text:text,analytic_setup:text,note_text:text,has_note:bool,source_provider:category,source_currency:text,source_pnl_basis:category,source_time_zone:category,opened_at:instant,closed_at:instant,opened_at_text:text,closed_at_text:text,entry_clock_ny:f('decimal','decimal','minutes_after_midnight_new_york'),source_span_minutes:f('duration','decimal','minutes')};
export const ASK_COVA_QUERY_FIELDS:Record<string,Record<string,QueryField>>=Object.freeze({
 trades:trade,
 journal_groups:{record_ref:ref,account_alias:ref,date:day,recorded_weekday:category,market:trade.market,side:category,contracts:trade.contracts,reported_pnl:trade.reported_pnl,currency:category,pnl_basis:category,outcome:category,setup_text:text,analytic_setup:text,source_provider:category,record_count:count,boundary_censored:bool},
 daily_notes:{...common,date:day,note_text:text,has_note:bool,linked_trade_ref:ref,link_status:category},
 rules:{...common,rule_ref:ref,rule_name:text,rule_metric:category,rule_limit:number,rule_enabled:bool,rule_severity:category,rule_scope:category},
 accounts:{...common,account_name:text,source_provider:category},
 passport_plans:{record_ref:ref,created_at:instant,date:day,max_daily_loss:number,max_trade_loss:number,max_contracts:f('decimal','decimal','contracts'),max_loss_streak:f('decimal','decimal','journal_groups'),plan_scope:category},
 passport_reviews:{record_ref:ref,account_alias:ref,date:day,note_text:text,xp:f('count','decimal','xp'),reason:text,revision:count,evidence_ref:ref,evidence_as_of:instant,updated_at:instant},
 passport_rewards:{record_ref:ref,account_alias:ref,date:day},
 capabilities:{capability:category,status:category,reason:category},
});
// Computed sequence outputs are not selectable source fields.
export const ASK_COVA_SEQUENCE_FIELDS:Readonly<Record<string,QueryField>>=Object.freeze({
 record_count:Object.freeze(f('count','decimal','trade_records')),
 reported_drawdown:Object.freeze(f('money','decimal','reported_pnl')),
 drawdown_peak:Object.freeze(f('money','decimal','reported_pnl')),
 drawdown_trough:Object.freeze(f('money','decimal','reported_pnl')),
 loss_streak:Object.freeze(f('count','decimal','trade_records')),
});
export const ASK_COVA_SEQUENCE=Object.freeze({source:'trades',metrics:Object.freeze(['reported_drawdown','loss_streak']),order:'verified_close',mode:'complete',limit:1,unit:'trade_records',fields:ASK_COVA_SEQUENCE_FIELDS,
 chronology:'Recorded dates order distinct days. Same-day records require distinct valid source close instants matching their UTC recorded dates; no ID, creation-time or storage-order tie breaker. Missing close times are allowed only on unique recorded dates.',
 basis:'Reuse v3 complete reported-P&L guards: confirmed single currency, valid whole-cent money, bounded totals and path. Mixed stored bases retain the explicit mixed reported bases, fees not reconciled qualifier; never treated as net.',
 population:'Matched trade records after query filters, not journal groups or completed positions. Empty or unreliable populations return unavailable, never zero or partial paths.',
 reported_drawdown:'Maximum peak-to-trough decline from initial zero within matched reported results, not account balance or intratrade changes.',
 loss_streak:'Longest consecutive negative reported-record run; zero and positive results reset the run. Not a completed-position streak or a prediction.'});
export const ASK_COVA_QUERY_SOURCES=Object.freeze(Object.keys(ASK_COVA_QUERY_FIELDS));
export const ASK_COVA_QUERY_FIELD_NAMES=Object.freeze([...new Set(Object.values(ASK_COVA_QUERY_FIELDS).flatMap(Object.keys))]);
for(const fields of Object.values(ASK_COVA_QUERY_FIELDS)){for(const field of Object.values(fields))Object.freeze(field);Object.freeze(fields);}
export const queryRef=(x:unknown):x is string=>typeof x==='string'&&/^[a-z][a-z0-9_]{0,31}$/.test(x);
export const queryDecimal=(x:unknown):x is string=>typeof x==='string'&&/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,9})?$/.test(x)&&! /^-0(?:\.0+)?$/.test(x);
