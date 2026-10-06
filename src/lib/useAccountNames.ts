import { useEffect, useReducer } from 'react';
import { ACCOUNT_NAMES_EVENT, readAccountNames } from './accountNames';
import { WORKSPACE_LOCAL_EVENT } from './workspaceAux';
/** Read the current owner on every render; never flash the previous owner's names. */
export function useAccountNames(owner: string) {
  const [, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => { const update = () => refresh(); for (const event of [ACCOUNT_NAMES_EVENT, WORKSPACE_LOCAL_EVENT, 'storage']) window.addEventListener(event, update); return () => { for (const event of [ACCOUNT_NAMES_EVENT, WORKSPACE_LOCAL_EVENT, 'storage']) window.removeEventListener(event, update); }; }, [owner]);
  return readAccountNames(owner);
}
