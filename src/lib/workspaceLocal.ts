import { readWorkspaceAux, workspaceAuxKey } from './workspaceAux';
import { account as validAccount } from './workspaceValidation';
import type { RiskRule, Trade } from './risk';
import { tradeAccountKey } from './tradovateHistory';
import { verifyBrokerCash, brokerCashFingerprint } from './brokerCash';
import { type WorkspaceValue, type WorkspaceRecord } from './workspaceModel';
const scope = (owner: string) => encodeURIComponent(owner.trim().toLowerCase());
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const WORKSPACE_LOCAL_EVENT = 'cova:workspace-local-change';
export async function workspaceHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
/** Preserve every existing ID; migration never guesses execution equivalence. */
export async function stableWorkspaceTrades(trades: Trade[]) {
  const remap = new Map<string, string>(),
    rows: Trade[] = [];
  const seen = new Set<string>();
  for (const trade of trades) {
    if (trade.id.startsWith('demo-')) continue;
    if (seen.has(trade.id))
      throw new Error(
        'Duplicate trade identity in this browser. Original records are kept; resolve the account/source conflict before uploading.',
      );
    seen.add(trade.id);
    remap.set(trade.id, trade.id);
    rows.push({ ...trade });
  }
  return { trades: rows, remap };
}
export type LocalWorkspace = {
  records: WorkspaceValue[];
  legacyKeys: string[];
  legacyValues: Record<string, string | null>;
  skippedCash: number;
  issues: { kind: string; key: string; reason: string }[];
};
export async function collectWorkspaceLocal(
  owner: string,
  trades: Trade[],
  rules: RiskRule[],
  { includeRules = true } = {},
): Promise<LocalWorkspace> {
  if (!uuid.test(owner)) throw new Error('A verified member UUID is required.');
  const prefix = scope(owner),
    legacyKeys: string[] = [],
    legacyValues: Record<string, string | null> = {},
    issues: { kind: string; key: string; reason: string }[] = [];
  // Snapshot exact allowlisted raw originals before interpreting their contents.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      (key === `cova-react-risk-os-v2:${prefix}` ||
        key === `cova-account-names-v1:${prefix}` ||
        (key.startsWith('cova-daily-journal-v1:') &&
          key.endsWith(':' + prefix)) ||
        (key.startsWith('cova-broker-cash-v1:') && key.endsWith(':' + prefix)))
    )
      legacyValues[key] = localStorage.getItem(key);
  }
  const stable = await stableWorkspaceTrades(trades);
  const rows: WorkspaceValue[] = stable.trades.map((t) => ({
    kind: 'trade',
    recordId: t.id,
    accountId: tradeAccountKey(t),
    schemaVersion: 1,
    payload: t as unknown as Record<string, unknown>,
  }));
  const ledgerKey = `cova-react-risk-os-v2:${prefix}`;
  if (localStorage.getItem(ledgerKey) !== null) legacyKeys.push(ledgerKey);
  if (includeRules)
    rows.push({
      kind: 'rules',
      recordId: 'current',
      accountId: 'all',
      schemaVersion: 1,
      payload: { rules },
    });
  let skippedCash = 0;
  const aux = readWorkspaceAux(owner);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      !aux &&
      key.startsWith('cova-daily-journal-v1:') &&
      key.endsWith(':' + prefix)
    ) {
      const encoded = key.slice(
        'cova-daily-journal-v1:'.length,
        -prefix.length - 1,
      );
      let account: string;
      try {
        account = decodeURIComponent(encoded);
      } catch {
        issues.push({
          kind: 'daily_note',
          key,
          reason: 'Invalid account scope; raw note data kept in backup.',
        });
        continue;
      }
      if (!account || account.length > 240) {
        issues.push({
          kind: 'daily_note',
          key,
          reason: 'Invalid account scope; raw note data kept in backup.',
        });
        continue;
      }
      legacyKeys.push(key);
      let notes;
      try {
        notes = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {
        issues.push({
          kind: 'daily_note',
          key,
          reason: 'Unreadable note data kept in backup.',
        });
        continue;
      }
      if (!notes || typeof notes !== 'object' || Array.isArray(notes)) {
        issues.push({
          kind: 'daily_note',
          key,
          reason: 'Invalid note collection; raw data kept in backup.',
        });
        continue;
      }
      for (const [date, raw] of Object.entries(notes)) {
        if (
          !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)) ||
          new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date
        ) {
          issues.push({
            kind: 'daily_note',
            key,
            reason: `Invalid date ${date}; raw note data kept in backup.`,
          });
          continue;
        }
        const p =
          typeof raw === 'string'
            ? { note: raw, tradeId: null }
            : (raw as { note: string; tradeId: string | null });
        if (!p || typeof p.note !== 'string' || p.note.length > 2000) {
          issues.push({
            kind: 'daily_note',
            key,
            reason: `Invalid note on ${date} kept in backup.`,
          });
          continue;
        }
        const tradeId = p.tradeId
          ? stable.remap.get(p.tradeId) || p.tradeId
          : null;
        if (
          tradeId &&
          !stable.trades.some(
            (t) =>
              t.id === tradeId &&
              (account === 'all' || tradeAccountKey(t) === account),
          )
        ) {
          issues.push({
            kind: 'daily_note',
            key,
            reason: `Note kept; unavailable trade attachment ${tradeId} detached.`,
          });
        }
        const attached =
          tradeId &&
          stable.trades.some(
            (t) =>
              t.id === tradeId &&
              (account === 'all' || tradeAccountKey(t) === account),
          )
            ? tradeId
            : null;
        rows.push({
          kind: 'daily_note',
          recordId: JSON.stringify([account, date]),
          accountId: account,
          schemaVersion: 1,
          payload: { date, note: p.note, tradeId: attached },
        });
      }
    } else if (!aux && key === `cova-account-names-v1:${prefix}`) {
      legacyKeys.push(key);
      let names;
      try {
        names = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {
        issues.push({
          kind: 'account',
          key,
          reason: 'Unreadable account names kept in backup.',
        });
        continue;
      }
      if (!names || typeof names !== 'object' || Array.isArray(names)) {
        issues.push({
          kind: 'account',
          key,
          reason: 'Invalid account name collection kept in backup.',
        });
        continue;
      }
      for (const [account, name] of Object.entries(names || {})) {
        if (
          typeof name === 'string' &&
          name.trim() &&
          name.length <= 128 &&
          validAccount(account) && account !== 'all' && !/[\x00-\x1f\x7f]/.test(name)
        )
          rows.push({
            kind: 'account',
            recordId: account,
            accountId: account,
            schemaVersion: 1,
            payload: { name },
          });
        else
          issues.push({
            kind: 'account',
            key,
            reason: `Invalid account display entry ${account} kept in backup.`,
          });
      }
    } else if (
      !aux &&
      key.startsWith('cova-broker-cash-v1:') &&
      key.endsWith(':' + prefix)
    ) {
      const account = key.slice(
        'cova-broker-cash-v1:'.length,
        -prefix.length - 1,
      );
      if (!/^[1-9]\d{0,15}$/.test(account)) {
        issues.push({
          kind: 'broker_cash',
          key,
          reason: 'Invalid cash account scope kept in backup.',
        });
        continue;
      }
      legacyKeys.push(key);
      let saved;
      try {
        saved = JSON.parse(localStorage.getItem(key) || 'null');
      } catch {
        skippedCash++;
        issues.push({
          kind: 'broker_cash',
          key,
          reason:
            'Unreadable fee evidence kept in backup; net remains unavailable.',
        });
        continue;
      }
      const accountTrades = stable.trades.filter(
        (t) =>
          t.source?.provider === 'Tradovate' && t.source.accountId === account,
      );
      const cash = verifyBrokerCash(saved?.cash, accountTrades);
      if (
        cash &&
        saved.fingerprint ===
          brokerCashFingerprint(
            accountTrades.filter(
              (t) =>
                t.date.slice(0, 10) >= cash.window.startDate &&
                t.date.slice(0, 10) < cash.window.endDate,
            ),
          )
      )
        rows.push({
          kind: 'broker_cash',
          recordId: `Tradovate:${account}`,
          accountId: `Tradovate:${account}`,
          schemaVersion: 1,
          payload: { cash, fingerprint: saved.fingerprint },
        });
      else {
        skippedCash++;
        issues.push({
          kind: 'broker_cash',
          key,
          reason:
            'Unvalidated fee evidence kept in backup; net remains unavailable.',
        });
      }
    }
  }
  if (aux) {
    legacyKeys.push(workspaceAuxKey(owner));
    for (const [account, notes] of Object.entries(aux.notes))
      for (const [date, p] of Object.entries(notes)) {
        const originalId = p.tradeId
          ? stable.remap.get(p.tradeId) || p.tradeId
          : null;
        const tradeId =
          originalId &&
          stable.trades.some(
            (t) =>
              t.id === originalId &&
              (account === 'all' || tradeAccountKey(t) === account),
          )
            ? originalId
            : null;
        if (originalId && !tradeId)
          issues.push({
            kind: 'daily_note',
            key: workspaceAuxKey(owner),
            reason: `Note kept; unavailable attachment ${originalId} detached.`,
          });
        rows.push({
          kind: 'daily_note',
          recordId: JSON.stringify([account, date]),
          accountId: account,
          schemaVersion: 1,
          payload: { date, note: p.note, tradeId },
        });
      }
    for (const [account, name] of Object.entries(aux.names))
      rows.push({
        kind: 'account',
        recordId: account,
        accountId: account,
        schemaVersion: 1,
        payload: { name },
      });
    for (const [account, p] of Object.entries(aux.cash)) {
      const cash = verifyBrokerCash(
        p.cash,
        stable.trades.filter((t) => tradeAccountKey(t) === account),
      );
      if (
        cash &&
        p.fingerprint ===
          brokerCashFingerprint(
            stable.trades.filter(
              (t) =>
                tradeAccountKey(t) === account &&
                t.date.slice(0, 10) >= cash.window.startDate &&
                t.date.slice(0, 10) < cash.window.endDate,
            ),
          )
      )
        rows.push({
          kind: 'broker_cash',
          recordId: account,
          accountId: account,
          schemaVersion: 1,
          payload: { cash, fingerprint: p.fingerprint },
        });
      else {
        skippedCash++;
        issues.push({
          kind: 'broker_cash',
          key: workspaceAuxKey(owner),
          reason:
            'Unvalidated cached fee evidence kept in backup; net remains unavailable.',
        });
      }
    }
  }
  return {
    records: rows.filter(row => row.kind !== 'broker_cash'),
    legacyKeys: [...new Set([...legacyKeys, ...Object.keys(legacyValues)])],
    legacyValues,
    skippedCash,
    issues,
  };
}
export async function saveWorkspaceBackup(
  owner: string,
  local: LocalWorkspace,
) {
  const id = crypto.randomUUID();
  const raw = {
    ...local.legacyValues,
    ...Object.fromEntries(
      local.legacyKeys
        .filter((k) => !(k in local.legacyValues))
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  };
  const hash = await workspaceHash(local.records);
  const key = `cova-workspace-backup-v1:${id}:${scope(owner)}`;
  const value = JSON.stringify({
    version: 1,
    owner,
    id,
    createdAt: new Date().toISOString(),
    contentHash: hash,
    records: local.records,
    legacy: raw,
    issues: local.issues,
  });
  localStorage.setItem(key, value);
  if (localStorage.getItem(key) !== value)
    throw new Error(
      'Browser backup could not be verified. No upload was started.',
    );
  return {
    backupId: id,
    contentHash: hash,
    issues: local.issues,
    counts: local.records.reduce<Record<string, number>>(
      (a, r) => ((a[r.kind] = (a[r.kind] || 0) + 1), a),
      {},
    ),
  };
}
/** Auxiliary cloud data is cached separately; legacy keys remain untouched for rollback. */
export function hydrateWorkspaceAuxiliary(
  owner: string,
  records: WorkspaceRecord[],
) {
  const prefix = scope(owner),
    active = records.filter((r) => !r.deletedAt);
  const notes: Record<string, Record<string, unknown>> = {};
  const names: Record<string, string> = {};
  const cash: Record<string, { cash: unknown; fingerprint: string }> = {};
  for (const row of active) {
    if (row.kind === 'daily_note') {
      (notes[row.accountId] ||= Object.create(null))[String(row.payload.date)] =
        { note: row.payload.note, tradeId: row.payload.tradeId };
    }
    if (row.kind === 'account') names[row.accountId] = String(row.payload.name);
    if (row.kind === 'broker_cash')
      cash[row.accountId] = {
        cash: row.payload.cash,
        fingerprint: String(row.payload.fingerprint),
      };
  }
  // Readers opt into cloud cache only after successful hydration, never replacing migration originals.
  localStorage.setItem(
    `cova-workspace-aux-v1:${prefix}`,
    JSON.stringify({ version: 1, notes, names, cash }),
  );
  window.dispatchEvent(new Event('cova:account-names'));
  window.dispatchEvent(new Event('cova:broker-cash-updated'));
}
