import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { analyze } from '../lib/risk';
import { getActionableReviewCount, getDashboardSummaryAction, type DashboardReviewTarget } from '../lib/dashboardReviewState';
import { FlagStack } from './DashboardCards';
type Analysis = ReturnType<typeof analyze>;
export function OaDisciplineReview({ analysis, go }: { analysis: Analysis; go: (target: DashboardReviewTarget) => void }) {
  const [details, setDetails] = useState(false);
  const action = getDashboardSummaryAction(analysis);
  const warnings = getActionableReviewCount(analysis);
  const flag = analysis.behaviorFlags.find(item => item.severity === 'critical' || item.severity === 'warning') ?? analysis.behaviorFlags[0];
  return <section className="astra-panel astra-discipline oa-discipline" aria-labelledby="astra-discipline-title">
    <div className="astra-panel-heading"><h2 id="astra-discipline-title">Cova score</h2><span className={`oa-discipline-state ${warnings ? 'has-warning' : ''}`}>{warnings ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : 'No warnings'}</span></div>
    <div className="oa-discipline-reading"><div className="oa-discipline-score" aria-label={`Cova Score ${analysis.score} out of 100`}><strong>{analysis.score}</strong><small>/100</small></div><div><p>{analysis.evidenceQuality.label}</p></div></div>
    <div className="oa-discipline-focus"><h3>{flag?.label || 'History review'}</h3><p>{flag?.summary || analysis.evidenceQuality.summary}</p></div>
    <div className="oa-discipline-actions">{action.target !== 'import' && <button className="dashboard-summary-primary oa-review-pill" type="button" onClick={() => go(action.target)}><small>{action.label}</small><ArrowUpRight aria-hidden="true" /></button>}<button className="oa-review-details-button" type="button" onClick={() => setDetails(true)}>Review details</button></div>
    {details && <DisciplineDetails analysis={analysis} onClose={() => setDetails(false)} go={go} />}
  </section>;
}
function DisciplineDetails({ analysis, onClose, go }: { analysis: Analysis; onClose: () => void; go: (target: DashboardReviewTarget) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const dialog = ref.current!; const opener = document.activeElement as HTMLElement | null; const previous = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previous; if (opener?.isConnected) opener.focus(); };
  }, []);
  const brief = analysis.nextSessionBrief;
  return <motion.dialog ref={ref} className="astra-trade-dialog oa-review-dialog" aria-labelledby="oa-review-details-title" data-discipline-details initial={reduced ? false : { opacity: 0, scale: .96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 26 }} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { const b = event.currentTarget.getBoundingClientRect(); if (event.clientX < b.left || event.clientX > b.right || event.clientY < b.top || event.clientY > b.bottom) onClose(); }}>
    <header><h2 id="oa-review-details-title">Review details</h2><button type="button" aria-label="Close review details" onClick={onClose}><X aria-hidden="true" /></button></header>
    <p className="oa-review-evidence">{analysis.tradeCount} {analysis.entryGroups.some(group => group.entryIdentified) ? 'entries' : 'trades'} checked · {analysis.evidenceQuality.summary}</p>
    <div className="astra-factor-list">{analysis.scoreFactors.map(factor => <div key={factor.label}><span>{factor.label}</span><strong className={factor.impact === 'negative' ? 'astra-negative' : factor.impact === 'positive' ? 'astra-positive' : ''}>{factor.impact}</strong></div>)}</div>
    <FlagStack analysis={analysis} onReviewRisk={() => { onClose(); go('rules'); }} />
    <section className="oa-next-review"><h3>Next review</h3><p>{brief.headline}</p>{brief.watchlist.map((item, index) => <p key={index}>{item}</p>)}<span>{brief.status === 'ready' ? 'Within limits' : brief.status === 'locked' ? 'Limit crossed' : 'Needs review'}</span><button type="button" className="oa-review-pill" onClick={() => { onClose(); go('coach'); }}>Open insights <ArrowUpRight aria-hidden="true" /></button></section>
    <p className="dashboard-review-disclosure">Retrospective analysis only. No live orders, broker controls, or future-result prediction.</p>
  </motion.dialog>;
}
