import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useAccountNames } from "../lib/useAccountNames";
import { accountDisplayName, rememberAccountNames } from "../lib/accountNames";

export function TradeAccountSelect({ owner, accounts, value, onChange }: { owner: string; accounts: string[]; value: string; onChange: (value: string) => void }) {
  const names = useAccountNames(owner);
  useEffect(() => { rememberAccountNames(owner, {}); }, [owner]);
  return <label className="group relative flex min-h-12 w-full items-center gap-4 rounded-lg border border-white/10 bg-[#0d0f14] pl-4 transition-colors hover:border-white/25 focus-within:border-blue-400/60 sm:max-w-sm">
    <span className="shrink-0 text-xs font-medium text-white/60">Account</span>
    <select aria-label="Trade account" className="min-h-12 min-w-0 flex-1 appearance-none rounded-r-lg bg-transparent py-3 pl-0 pr-10 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 [&>option]:bg-[#0d0f14]" value={value} onChange={event => onChange(event.target.value)}>
      <option value="all">All accounts</option>
      {accounts.map(account => <option key={account} value={account}>{accountDisplayName(account, names)}</option>)}
    </select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 h-4 w-4 text-white/50" />
  </label>;
}
