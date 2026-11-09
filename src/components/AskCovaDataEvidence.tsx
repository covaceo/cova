import type { AskCovaDataSnapshot } from '../lib/askCovaData';
import type { AskCovaEvidenceSupport } from '../lib/askCovaQuery';
import type { RiskRule } from '../lib/risk';

type Entry = { title: string; fields: [string, string][] };
const limits = (value: { maxDailyLoss: number | null; maxTradeLoss: number | null; maxContracts: number | null; maxLossStreak: number | null }): [string, string][] => [
  ['Daily loss limit', value.maxDailyLoss === null ? 'Not set' : String(value.maxDailyLoss)],
  ['Single-trade loss limit', value.maxTradeLoss === null ? 'Not set' : String(value.maxTradeLoss)],
  ['Maximum contracts', value.maxContracts === null ? 'Not set' : String(value.maxContracts)],
  ['Maximum losing streak', value.maxLossStreak === null ? 'Not set' : String(value.maxLossStreak)],
];
function entry(snapshot: AskCovaDataSnapshot, support: AskCovaEvidenceSupport): Entry[] {
  const record = snapshot.workspaceRecords.find(r => !r.deletedAt && r.kind === support.kind && r.recordId === support.recordId && r.accountId === support.accountId);
  if (support.kind === 'daily_note' && record) return [{ title: 'Daily note', fields: [
    ['Recorded date', String(record.payload.date)], ['Saved note', String(record.payload.note)],
    ['Linked trade', record.payload.tradeId === null ? 'No linked trade' : 'Saved trade link; not proof of a trade outcome'],
  ] }];
  if (support.kind === 'rules' && record) return (record.payload.rules as RiskRule[])
    .filter(rule => !support.field || rule.id === support.field).map(rule => ({ title: 'Current risk rule', fields: [
      ['Rule', rule.name], ['Measure', rule.metric], ['Limit', String(rule.limit)],
      ['Enabled', rule.enabled ? 'Yes' : 'No'], ['Severity', rule.severity],
      ['Scope', 'Owner-wide current configuration, not historical compliance'],
    ] }));
  if (support.kind === 'account' && record) return [{ title: 'Saved account', fields: [['Account name', String(record.payload.name)]] }];
  if (support.kind === 'passport_plans') {
    const plan = snapshot.passportPlans.find(p => String(p.id) === support.recordId && p.owner_id === snapshot.owner);
    return plan ? [{ title: 'Passport plan', fields: [['Saved at', plan.created_at], ['Scope', 'Owner-wide saved plan; not proof that a historical session followed it'], ...limits(plan.limits)] }] : [];
  }
  if (support.kind === 'passport_reviews') {
    const review = snapshot.passportReviews.find(r => r.owner_id === snapshot.owner && r.account_key === support.accountId && JSON.stringify([r.session_day, r.account_key]) === support.recordId);
    return review ? [{ title: 'Passport review', fields: [['Session day', review.session_day], ['Saved review', review.note], ['XP', String(review.xp)], ['Reason', review.reason], ['Saved revision', String(review.revision)], ['Evidence through', review.evidence_as_of ?? 'Not recorded'], ['Updated at', review.updated_at]] }] : [];
  }
  if (support.kind === 'passport_rewards') {
    const reward = snapshot.passportRewards.find(r => r.owner_id === snapshot.owner && r.account_key === support.accountId && r.session_day === support.recordId);
    return reward ? [{ title: 'Passport reward', fields: [['Session day', reward.session_day], ['Allocation', 'Saved reward allocation; not a cash balance']] }] : [];
  }
  return [];
}
/** Captured, locally replayed support only. All saved text is a React text child. */
export function AskCovaDataEvidence({ snapshot, supports }: { snapshot: AskCovaDataSnapshot; supports: readonly AskCovaEvidenceSupport[] }) {
  const entries = supports.flatMap(support => entry(snapshot, support));
  return <div className="ask-cova-reply" data-cova-evidence aria-label="Saved data behind this answer">
    {entries.map((item, index) => <div key={index}><h3>{item.title}</h3><dl>{item.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>)}
  </div>;
}
