export const WORKSPACE_LOCAL_EVENT = 'cova:workspace-local-change';
export type WorkspaceAux = {
  version: 1;
  notes: Record<
    string,
    Record<string, { note: string; tradeId: string | null }>
  >;
  names: Record<string, string>;
  cash: Record<string, { cash: unknown; fingerprint: string }>;
};
export const workspaceAuxKey = (owner: string) =>
  `cova-workspace-aux-v1:${encodeURIComponent(owner.trim().toLowerCase())}`;
export function readWorkspaceAux(owner: string): WorkspaceAux | null {
  try {
    const aux = JSON.parse(
      localStorage.getItem(workspaceAuxKey(owner)) || 'null',
    );
    return aux?.version === 1 && aux.notes && aux.names && aux.cash
      ? aux
      : null;
  } catch {
    return null;
  }
}
export function saveWorkspaceAux(owner: string, value: WorkspaceAux) {
  localStorage.setItem(workspaceAuxKey(owner), JSON.stringify(value));
  window.dispatchEvent(new Event(WORKSPACE_LOCAL_EVENT));
}