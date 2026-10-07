import { useEffect } from "react";
import DropdownMenu10 from "./watermelon/dropdown-menu-10";
import { useAccountNames } from "../lib/useAccountNames";
import { accountDisplayName, rememberAccountNames } from "../lib/accountNames";

export function TradeAccountSelect({ owner, accounts, value, onChange }: { owner: string; accounts: string[]; value: string; onChange: (value: string) => void }) {
  const names = useAccountNames(owner);
  useEffect(() => { rememberAccountNames(owner, {}); }, [owner]);
  return <DropdownMenu10 key={owner || "guest"} value={value} onChange={onChange} options={[{key:"all",label:"All accounts"},...accounts.map(key=>({key,label:accountDisplayName(key,names)}))]} />;
}
