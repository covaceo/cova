import { groupJournalEntries, type JournalEntryGroup, type Trade } from './risk';

/** Broker-linked recap groups, not certified flat-to-flat positions.
 * Opening-fill grouping already joins trims. A shared closing fill additionally
 * proves that distinct opening fills were reduced together (scale-ins/split fills).
 * Never join on price, timestamp, overlap or market alone, or across fill roles.
 */
export function groupRecapEntries(trades: readonly Trade[]): JournalEntryGroup[] {
  const groups = groupJournalEntries(trades);
  const parents = groups.map((_, index) => index);
  const root = (index: number): number => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  };
  const closes = new Map<string, { index: number; row: Trade; valid: boolean }[]>();
  groups.forEach((group, index) => group.rows.forEach(row => {
    const pair = /^tradovate-([1-9]\d{0,19}):([1-9]\d{0,19}):([1-9]\d{0,19})$/.exec(row.id);
    if (!pair || row.source?.provider !== 'Tradovate' || pair[1] !== row.source.accountId) return;
    const key = JSON.stringify([row.source.accountId, row.side, pair[row.side === 'Long' ? 3 : 2]]);
    const members = closes.get(key) ?? [];
    members.push({ index, row, valid: group.entryIdentified }); closes.set(key, members);
  }));
  for (const members of closes.values()) {
    const first = members[0].row;
    // A fill has one instrument, execution price and timestamp. Contradictory
    // evidence cannot connect otherwise independent opening-fill groups.
    if (!members.every(({ row, valid }) => valid && row.market === first.market && row.exit === first.exit
      && row.source?.provider === 'Tradovate' && first.source?.provider === 'Tradovate'
      && row.source.closedAt === first.source.closedAt)) continue;
    const parent = root(members[0].index);
    for (const member of members) parents[root(member.index)] = parent;
  }
  const components = new Map<number, JournalEntryGroup[]>();
  groups.forEach((group, index) => {
    const key = root(index), members = components.get(key) ?? [];
    members.push(group); components.set(key, members);
  });
  const result = [...components.values()].flatMap(members => {
    if (members.length === 1) return members;
    const rows = members.flatMap(group => group.rows);
    const cents = rows.reduce((sum, row) => sum + BigInt(Math.round(row.pnl * 100)), 0n);
    const contracts = rows.reduce((sum, row) => sum + row.contracts, 0);
    if (!Number.isSafeInteger(contracts) || cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < -BigInt(Number.MAX_SAFE_INTEGER)) return members;
    return [{ id: JSON.stringify(['recap-linked-fills', ...members.map(group => group.id).sort()]), rows,
      pnl: Number(cents) / 100, contracts, entryIdentified: true }];
  });
  const closed = (group: JournalEntryGroup) => group.rows.reduce((latest, row) => {
    const at = row.source?.provider === 'Tradovate' && row.source.closedAt ? row.source.closedAt : `${row.date}T00:00:00.000Z`;
    return at > latest ? at : latest;
  }, '');
  return result.sort((a, b) => closed(a).localeCompare(closed(b)));
}
