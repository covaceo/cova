import assert from 'node:assert/strict';
import {withoutHomeScreenInstall} from './approved-home-screen.mjs';

/** Reverse only the approved read-only journal index, preserving all prior App behavior. */
export function withoutJournalHistory(source) {
  const lines = [
    'import { listDailyJournalEntries } from "./lib/journalNavigation";',
    '    list: () => dashboardPrincipal && dashboardSelectionCurrent() && isImportPrincipalCurrent(dashboardPrincipal,getCurrentImportPrincipal()) ? listDailyJournalEntries(dashboardPrincipal.identity,tradeAccount) : [],',
  ];
  let restored = source.split(String.fromCharCode(13,10)).join(String.fromCharCode(10));
  for (const line of lines) {
    assert.equal(restored.split(line).length, 2, 'Exact guarded journal history extension');
    restored = restored.replace(line + String.fromCharCode(10), '');
  }
  return withoutHomeScreenInstall(restored);
}
