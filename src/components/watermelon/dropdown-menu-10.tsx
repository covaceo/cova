"use client";
import { useEffect, useRef, useState } from "react";
import { FaLayerGroup, FaWallet } from "react-icons/fa6";
import { ChevronDown } from "lucide-react";
import { Button } from "../base-ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "../base-ui/dropdown-menu";
import "../../styles/accountDropdown.css";
export type AccountMenuOption = { key: string; label: string };
export default function DropdownMenu10({ options, value, onChange }: { options: AccountMenuOption[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const blocked = () => !host.current?.isConnected || Boolean(host.current.closest("[inert],fieldset:disabled"));
  useEffect(() => {
    if (!open) return;
    const observer = new MutationObserver(() => { if (blocked()) setOpen(false); });
    const boundary = host.current?.closest(".workspace-shell") || host.current?.parentElement;
    if (boundary) observer.observe(boundary, { attributes: true, subtree: true, attributeFilter: ["inert", "disabled"] });
    return () => observer.disconnect();
  }, [open]);
  const selected = options.find(item => item.key === value);
  return <div ref={host} className="cova-account-dropdown" data-component="watermelon-dropdown-menu-10" data-account-value={value}>
    <DropdownMenu open={open} onOpenChange={next => setOpen(next && !blocked())}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Trade account" className="cova-account-menu-trigger rounded-lg">
          <span className="cova-account-menu-prefix">Account</span>
          <span className="cova-account-menu-selection">{selected?.label || "Choose account"}</span>
          <ChevronDown aria-hidden="true" className="cova-account-menu-chevron" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="cova-account-menu-content bg-popover w-64 rounded-lg border p-1 shadow-md" align="end" collisionPadding={12}>
        <DropdownMenuLabel className="cova-account-menu-label px-1 pb-1 text-sm font-semibold">Accounts</DropdownMenuLabel>
        {options.map(item => {
          const Icon = item.key === "all" ? FaLayerGroup : FaWallet;
          return <DropdownMenuCheckboxItem key={item.key} checked={value === item.key} data-account-key={item.key}
            onCheckedChange={() => { if (blocked()) { setOpen(false); return; } if (value !== item.key) onChange(item.key); }}
            className="cova-account-menu-item group flex cursor-pointer items-center gap-3 rounded-lg p-1 data-[disabled]:opacity-40">
            <Icon aria-hidden="true" className="cova-account-menu-icon text-muted-foreground group-hover:text-foreground transition-all duration-200 group-hover:scale-110" />
            <span className="cova-account-menu-name flex-1 text-sm font-medium">{item.label}</span>
          </DropdownMenuCheckboxItem>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
