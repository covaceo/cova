import { type FormEvent, useEffect, useRef, useState } from "react";
import { RithmicAttribution } from "./RithmicAttribution";

export type RithmicCredentials = {
  username: string;
  password: string;
  accountKey?: string;
  lookbackDays: 30 | 90 | 180;
  systemName: "Rithmic Paper Trading" | "Rithmic 01" | "Rithmic Test";
};
export type RithmicSyncResult = { selectionRequired?: boolean; accounts?: { accountKey?: string; accountId?: string; accountName?: string }[] };

export function RithmicLogin({ busy, sync, notice }: {
  busy: boolean;
  sync: (credentials: RithmicCredentials) => Promise<RithmicSyncResult | void> | RithmicSyncResult | void;
  notice: (message: string) => void;
}) {
  const [credentials, setCredentials] = useState<RithmicCredentials>({ username: "", password: "", lookbackDays: 90, systemName: "Rithmic Paper Trading" });
  const [accounts, setAccounts] = useState<NonNullable<RithmicSyncResult["accounts"]>>([]);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const locked = busy || submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pending.current || !credentials.username.trim() || !credentials.password) return;
    pending.current = true;
    setSubmitting(true);
    const request = { ...credentials };
    // The request owns the one-time login; do not retain it in the form while waiting.
    setCredentials(current => ({ ...current, username: "", password: "" }));
    notice("");
    try {
      const result = await sync(request);
      if (!mounted.current) return;
      if (result?.selectionRequired && result.accounts?.length) {
        const choices = result.accounts.filter(account => account.accountKey);
        setAccounts(choices);
        setCredentials(current => ({ ...current, accountKey: choices[0]?.accountKey }));
      }
    } catch {
      if (mounted.current) notice("Rithmic sync failed. Your login was not stored. Try again or upload a CSV.");
    } finally {
      pending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  return <form id="rithmic-login" className="accounts-panel accounts-rithmic-login" data-rithmic-connect onSubmit={submit} aria-busy={locked}>
    <h3>Rithmic login</h3>
    <p>Read-only trade history. No orders or money movement. Your login is not stored.</p>
    <fieldset disabled={locked} className="accounts-login-fields">
      <label className="accounts-field">System<select aria-label="Rithmic system" data-rithmic-environment value={credentials.systemName} onChange={event => {
        setAccounts([]);
        setCredentials(current => ({ ...current, username: "", password: "", accountKey: undefined, systemName: event.target.value as RithmicCredentials["systemName"] }));
      }}><option value="Rithmic Paper Trading">Paper Trading</option><option value="Rithmic 01">Live Trading (R01)</option><option value="Rithmic Test">Rithmic Test</option></select></label>
      <label className="accounts-field">Username<input aria-label="Rithmic username" autoComplete="username" required type="text" value={credentials.username} onChange={event => setCredentials(current => ({ ...current, username: event.target.value }))} /></label>
      <label className="accounts-field">Password<input aria-label="Rithmic password" autoComplete="current-password" required type="password" value={credentials.password} onChange={event => setCredentials(current => ({ ...current, password: event.target.value }))} /></label>
      {accounts.length > 0 && <label className="accounts-field">Account<select aria-label="Rithmic account" data-rithmic-account value={credentials.accountKey || ""} onChange={event => setCredentials(current => ({ ...current, accountKey: event.target.value }))}>{accounts.map(account => <option key={account.accountKey} value={account.accountKey}>{account.accountName || account.accountId || account.accountKey}</option>)}</select></label>}
      <label className="accounts-field">History range<select aria-label="Rithmic history range" value={credentials.lookbackDays} onChange={event => setCredentials(current => ({ ...current, lookbackDays: Number(event.target.value) as RithmicCredentials["lookbackDays"] }))}><option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option></select></label>
      <button className="accounts-button accounts-button-primary" type="submit">{locked ? "Syncing…" : "Sync history"}</button>
    </fieldset>
    {accounts.length > 0 && <p>Choose an account, then re-enter your login to import its trades.</p>}
    <p>P&amp;L is before commissions.</p>
    <RithmicAttribution compact />
  </form>;
}
