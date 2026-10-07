import {useMemo, useRef, useState} from "react";
import {ArrowUpRight, ArrowRight, ChevronDown, Activity, ListFilter, BookOpen, Search, RotateCcw} from "lucide-react";
import {motion, AnimatePresence, useReducedMotion} from "motion/react";
import {analyze, sampleTrades, defaultRules, type Trade} from "../../lib/risk";
import {signedMoney} from "../../lib/dashboardPresentation";
import {AstraEquityCurve} from "../AstraEquityCurve";
import {DashboardTradeDialog} from "../DashboardTradeDialog";
import {MiniJournal, type JournalActions} from "../MiniJournal";
import "../../styles/landingRiskDesk.css";

type Chapter = "results" | "trades" | "journal";
type Range = "all" | "week" | "today";
const chapters: {id:Chapter; title:string; copy:string; action:string}[] = [
 {id:"results", title:"See the whole session", copy:"See how each trade shaped your results.", action:"Explore the curve"},
 {id:"trades", title:"Inspect the turning points", copy:"Open any trade for the details.", action:"Review sample trades"},
 {id:"journal", title:"Keep the context", copy:"Keep the lesson with the trade.", action:"Try the journal"},
];
const ranges: {id:Range;label:string}[]=[{id:"today",label:"Latest session"},{id:"week",label:"Last 7 days"},{id:"all",label:"All trades"}];
const sample:Trade[] = sampleTrades.map(trade=>({...trade,manual:{accountKey:"landing-sample",currency:"USD",pnlBasis:"gross_before_fees"}}));
function selectRange(range:Range) {
 if(range==="all")return sample;
 const latest=sample[sample.length-1].date;
 if(range==="today")return sample.filter(t=>t.date===latest);
 const cutoff=new Date(`${latest}T00:00:00Z`);cutoff.setUTCDate(cutoff.getUTCDate()-6);
 return sample.filter(t=>t.date>=cutoff.toISOString().slice(0,10));
}
export function RiskDeskFeature({go}:{go:(section:"dashboard"|"import")=>void}) {
 const [chapter,setChapter]=useState<Chapter>("results");
 const instrument=useRef<HTMLDivElement>(null);const reduced=useReducedMotion();
 const explore=()=>{setChapter("results");requestAnimationFrame(()=>{
  instrument.current?.scrollIntoView({behavior:reduced?"instant":"smooth",block:"start"});
  instrument.current?.querySelector<SVGElement>('.astra-chart-svg')?.focus({preventScroll:true});
 });};
 return <section className="cova-landing-product cova-risk-feature" aria-labelledby="landing-product-title" data-feature="risk-desk">
  <div className="cova-risk-copy">
   <h2 id="landing-product-title">Know the story<br/>behind your P&amp;L.</h2>
   <p className="cova-risk-intro">Your results. Your trades. The context behind them.</p>
   <div className="cova-risk-actions"><button className="cova-risk-primary" type="button" onClick={explore}>Explore sample <ArrowUpRight size={18} aria-hidden="true"/></button><button className="cova-risk-secondary" type="button" onClick={()=>go("dashboard")}>Review my trades <ArrowRight size={17} aria-hidden="true"/></button></div>
   <div className="cova-risk-chapters">
    {chapters.map((item,index)=><div className="cova-risk-chapter" data-feature-chapter={item.id} data-active={chapter===item.id} key={item.id}>
     <h3><button type="button" id={`risk-chapter-${item.id}`} aria-expanded={chapter===item.id} aria-controls={`risk-chapter-panel-${item.id}`} onClick={()=>setChapter(item.id)}><span className="cova-risk-chapter-number">0{index+1}</span><span>{item.title}</span><ChevronDown size={18} aria-hidden="true"/></button></h3>
     <AnimatePresence initial={false}>{chapter===item.id&&<motion.div id={`risk-chapter-panel-${item.id}`} role="region" aria-labelledby={`risk-chapter-${item.id}`} initial={reduced?false:{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.2}} className="cova-risk-chapter-body"><p>{item.copy}</p><button type="button" onClick={()=>{instrument.current?.scrollIntoView({behavior:reduced?"instant":"smooth",block:"start"});requestAnimationFrame(()=>instrument.current?.querySelector<HTMLElement>(item.id==="results"?'.astra-chart-svg':item.id==="trades"?'input[type="search"]':'textarea')?.focus({preventScroll:true}));}}>{item.action}<ArrowUpRight size={15} aria-hidden="true"/></button></motion.div>}</AnimatePresence>
    </div>)}
   </div>
  </div>
  <div className="cova-risk-stage">
   <div className="cova-risk-scene">
    <img className="cova-risk-orbit" src="/media/cova-risk-desk-orbit.webp" width={1536} height={1024} alt="" aria-hidden="true" loading="lazy" decoding="async"/>
    <div className="cova-risk-orbit-shade" aria-hidden="true"/>
    <div ref={instrument} className="cova-risk-instrument" data-risk-desk-preview="interactive-sample">
     <RiskDeskSample chapter={chapter} setChapter={setChapter}/>
    </div>
   </div>
   <p className="cova-risk-disclosure">Interactive demo · sample data</p>
  </div>
 </section>;
}

export function RiskDeskSample({chapter,setChapter}:{chapter:Chapter;setChapter:(chapter:Chapter)=>void}) {
 const [range,setRange]=useState<Range>("all");const [selected,setSelected]=useState<Trade|null>(null);
 const [query,setQuery]=useState("");const [journalKey,setJournalKey]=useState(0);
 const notes=useRef(new Map<string,{note:string;tradeId:string|null}>([[sample[sample.length-1].date,{note:"Waited for the opening range. Kept size at two contracts and stopped after the planned window.",tradeId:sample[sample.length-1].id}]]));
 const scoped=useMemo(()=>selectRange(range),[range]);const review=useMemo(()=>analyze(scoped,defaultRules),[scoped]);
 const journalActions:JournalActions=useMemo(()=>({ephemeral:true,read:(date:string)=>notes.current.get(date)?.note||"",readEntry:(date:string)=>notes.current.get(date)||{note:"",tradeId:null},save:(date:string,note:string,tradeId?:string|null)=>{if(tradeId&&!sample.some(t=>t.id===tradeId))return false;notes.current.set(date,{note,tradeId:tradeId||null});return true;}}),[]);
 const results=sample.filter(t=>`${t.market} ${t.side} ${t.date} ${t.setup}`.toLowerCase().includes(query.trim().toLowerCase())).slice().reverse();
 const latest=review.trades.slice(-3).reverse();
 const tabs=[{id:"results" as const,label:"Results",Icon:Activity},{id:"trades" as const,label:"Trades",Icon:ListFilter},{id:"journal" as const,label:"Journal",Icon:BookOpen}];
 return <div className="cova-risk-demo" data-preview-chapter={chapter}>
  <header className="cova-demo-topbar"><div className="cova-demo-brand"><img src="/media/wordmark-options/cova-wordmark-option-3-sleek-cropped.png" alt="Cova" width={67} height={23}/><span>Risk Desk</span></div><span className="cova-demo-sample">Sample trades</span></header>
  <nav className="cova-demo-tabs" aria-label="Sample Risk Desk views">{tabs.map(({id,label,Icon})=><button type="button" key={id} aria-current={chapter===id?"page":undefined} data-sample-view={id} onClick={()=>setChapter(id)}><Icon size={15} aria-hidden="true"/>{label}</button>)}</nav>
  <div className="cova-demo-body">
   {chapter==="results"&&<div className="cova-demo-results">
    <div className="cova-demo-result-heading"><div><span className="cova-demo-label">Reported P&amp;L</span><strong data-sample-pnl className={review.totalPnl<0?"is-negative":""}>{signedMoney(review.totalPnl)}</strong></div><div className="cova-demo-secondary-stats"><div><span>Win rate</span><strong data-sample-winrate>{Math.round(review.winRate*100)}%</strong></div><div><span>Trades</span><strong data-sample-count>{review.tradeCount}</strong></div></div></div>
    <div className="cova-demo-chart-heading"><h4>Equity curve</h4><div className="cova-demo-ranges" role="group" aria-label="Sample review range">{ranges.map(item=><button key={item.id} type="button" data-sample-range={item.id} aria-pressed={range===item.id} onClick={()=>setRange(item.id)}>{item.label}</button>)}</div></div>
    <AstraEquityCurve points={review.equityPoints} accountPnlCents={Math.round(review.totalPnl*100)}/>
    <div className="cova-demo-recent-heading"><h4>Recent trades</h4><button type="button" onClick={()=>setChapter("trades")}>Review trades <ArrowUpRight size={14} aria-hidden="true"/></button></div>
    <div className="cova-demo-recent">{latest.map(t=><button type="button" data-sample-trade={t.id} key={t.id} onClick={()=>setSelected(t)}><span className="cova-demo-market">{t.market}</span><span className="cova-demo-trade-side">{t.side}</span><span className="cova-demo-trade-date">{t.date}</span><strong className={t.pnl<0?"is-negative":""}>{signedMoney(t.pnl)}</strong><ArrowUpRight size={14} aria-hidden="true"/></button>)}</div>
   </div>}
   {chapter==="trades"&&<div className="cova-demo-trades"><div className="cova-demo-view-heading"><h4>Trade review</h4><span>{sample.length} sample trades</span></div><label className="cova-demo-search"><Search size={16} aria-hidden="true"/><input aria-label="Search sample trades" placeholder="Search market, setup or date" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="cova-demo-trade-list" role="region" aria-label="Sample trade results" tabIndex={0}>
    <div className="cova-demo-table-heading"><span>Trade / setup</span><span>Reported P&amp;L</span></div>
    {results.map(t=><button type="button" data-sample-trade={t.id} key={t.id} onClick={()=>setSelected(t)}><span><b>{t.market} <small>{t.side} · {t.date}</small></b><em>{t.setup}</em></span><strong className={t.pnl<0?"is-negative":""}>{signedMoney(t.pnl)}</strong><ArrowUpRight size={15} aria-hidden="true"/></button>)}
    {!results.length&&<p role="status">No matching sample trades.</p>}
   </div></div>}
   {chapter==="journal"&&<div className="cova-demo-journal"><div className="cova-demo-view-heading"><h4>Session journal</h4><button type="button" className="cova-demo-reset" onClick={()=>{notes.current.clear();setJournalKey(k=>k+1);}}>Reset sample <RotateCcw size={14} aria-hidden="true"/></button></div><MiniJournal key={journalKey} initialDate={sample[sample.length-1].date} actions={journalActions} trades={sample} onOpenTrade={id=>setSelected(sample.find(t=>t.id===id)||null)}/></div>}
  </div>
  <details className="cova-demo-data-details"><summary>Data details</summary><div><p>Sample trades · USD · gross before fees.</p><p>Max drawdown <strong data-sample-drawdown>{signedMoney(-review.maxDrawdown)}</strong></p><p>Review only. No live orders or customer returns. Sample notes reset on reload.</p></div></details>
  <DashboardTradeDialog trade={selected} journalReview={false} onClose={()=>setSelected(null)}/>
 </div>;
}
