/** Display only. Never mutate checked notices, model input, history or digests.
 * Only exact code-owned templates may collapse; new/changed warnings stay visible.
 * Every original remains available in the answer's local details.
 */
export function askCovaVisibleNotices(notices: readonly string[]): string[] {
  const bases = new Set<string>();
  const visible = notices.flatMap(notice => {
    if (/^Saved (?:all|week|today) range: (?:\d{4}-\d{2}-\d{2}|no dated records) to (?:\d{4}-\d{2}-\d{2}|no dated records); recorded dates, not live broker history\.$/.test(notice)
      || notice === 'Saved source completeness does not certify broker truth or field completeness.') return [];
    const basis = /^(?:[a-z][a-z0-9_]{0,31}: (self-reported net|gross, before fees|reported P&L, fees unknown)|Reported P&L basis: (self-reported net|gross, before fees|reported P&L, fees unknown)\. This is not reconciled broker cash or allocated account fees)\.$/.exec(notice);
    if (basis) { bases.add(basis[1] ?? basis[2]); return []; }
    if (notice === 'Reported P&L basis: mixed reported bases, fees not reconciled. This is not reconciled broker cash or allocated account fees.'
      || /^[a-z][a-z0-9_]{0,31}: mixed reported bases, fees not reconciled\.$/.test(notice)) return ['Mixed P&L bases; fees are not reconciled.'];
    if (/^[a-z][a-z0-9_]{0,31}: self-reported planned risk\.$/.test(notice)) return ['Self-reported planned risk.'];
    if (/^[a-z][a-z0-9_]{0,31}: stored risk value; zero does not establish planned risk\.$/.test(notice)) return ['Stored risk; zero does not confirm planned risk.'];
    const top = /^([a-z][a-z0-9_]{0,31}): (\d+) of (\d+) (groups|records) shown after the complete scan; (\d+) omitted boundary ties\. This is not a full-text summary of omitted records\.$/.exec(notice);
    if (top) return [`${top[1]}: Showing ${top[2]} of ${top[3]} ${top[4]}${top[5] === '0' ? '.' : `; ${top[5]} equally ranked results are not shown.`} Omitted records are not summarized.`];
    const partial = /^([a-z][a-z0-9_]{0,31}\.[a-z][a-z0-9_]{0,31}): (\d+)\/(\d+) usable; incomplete fields are not a complete total\.$/.exec(notice);
    if (partial) return [`${partial[1]}: only ${partial[2]} of ${partial[3]} values usable; not a complete total.`];
    const scan = /^([a-z][a-z0-9_]{0,31}\.[a-z][a-z0-9_]{0,31}): (\d+)\/(\d+) usable across all matches; incomplete fields \(([a-z_, ]+)\) also affect omitted groups\.$/.exec(notice);
    if (scan) {
      const reasons: Record<string,string> = { risk_unavailable: 'planned risk missing', unknown_currency: 'currency unknown', missing: 'missing values', invalid_money: 'invalid P&L', unsupported_decimal: 'unsupported value' };
      return [`${scan[1]}: only ${scan[2]} of ${scan[3]} matches have usable values (${scan[4].split(', ').map(reason => Object.prototype.hasOwnProperty.call(reasons, reason) ? reasons[reason] : reason).join(', ')}); omitted groups are affected too.`];
    }
    if (notice === 'Sequence unit: trade records, not journal groups or completed positions. The sequence uses only matched records after query filters; excluded intervening records do not participate. Recorded dates order different days; same-day records require distinct source closing instants matching their UTC recorded dates. No ID, creation time or storage order breaks ties.') return ['Uses matching trade records, not completed positions; filtered-out trades do not count in this sequence.'];
    if (notice === 'Reported drawdown starts at initial zero before the matched range, not your account balance; it excludes price changes while trades were open and is not intratrade drawdown.') return ['Drawdown starts from zero, not your account balance; price changes while trades were open are excluded.'];
    const sequence = /^([a-z][a-z0-9_]{0,31}): sequence unavailable \(ambiguous_chronology\); no partial path or invented ordering is reported\.$/.exec(notice);
    if (sequence) return [`${sequence[1]}: closing order is unclear; no sequence result is available.`];
    const scope: Record<string,string> = {
      'These saved rules are owner-global current configuration, not historical rules in force. Limits have their rule-specific units; no currency is inferred.': 'Current rules apply across your accounts, not historically. Units vary by rule; currency is not assumed.',
      'Passport plans are separate owner-global saved historical limits, not the current workspace rules or broker-certified compliance.': 'Saved Passport limits apply across your accounts; they are not current rules or verified broker compliance.',
      'Passport records describe saved reviews and reward allocation, not independently verified broker outcomes.': 'Saved reviews and rewards, not verified broker results.',
      'Journal groups use validated fill links before query filters; not certified completed positions. Groups may be censored by selected dates.': 'Linked fills, not confirmed completed positions; date filters can leave groups incomplete.',
      'Quoted saved text is self-reported, not verified financial evidence.': 'Saved text is self-reported, not verified financial evidence.',
      'Loss streak is the longest consecutive run of negative reported trade records; zero and positive results reset the run. It is not a completed-position streak or a prediction.': 'Longest run of losing trade records, not completed positions. Breakeven or a win resets it; this is not a prediction.',
    };
    return [Object.prototype.hasOwnProperty.call(scope, notice) ? scope[notice] : notice];
  });
  const labels: Record<string,string> = { 'self-reported net': 'Self-reported net.', 'gross, before fees': 'Before fees.', 'reported P&L, fees unknown': 'Fees unknown.' };
  if (bases.size === 1) visible.push(labels[[...bases][0]]);
  else if (bases.size > 1) visible.push(`Mixed P&L bases: ${[...bases].map(basis => labels[basis].slice(0,-1).toLowerCase()).join('; ')}. Keep these results separate.`);
  return [...new Set(visible)];
}
