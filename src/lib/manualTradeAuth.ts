import { isImportPrincipalCurrent, type ImportPrincipal } from './importGuard';

type ManualTradePrincipal = { current: ImportPrincipal | null };

/** Only manual-entry drafts may follow a verified refresh of the same login. */
export class ManualTradeAuth {
  private scope: ManualTradePrincipal = { current: null };

  capture(principal: ImportPrincipal | null): ManualTradePrincipal {
    if (!isImportPrincipalCurrent(this.scope.current, principal)) {
      this.scope = { current: principal ? { ...principal } : null };
    }
    return this.scope;
  }

  refresh(previous: ImportPrincipal, next: ImportPrincipal, previousSession: string | null, nextSession: string | null) {
    if (
      previousSession && previousSession === nextSession
      && isImportPrincipalCurrent(this.scope.current, previous)
      && previous.identity === next.identity
      && previous.identityGeneration === next.identityGeneration
      && next.authGeneration === previous.authGeneration + 1
    ) {
      this.scope.current = { ...next };
    }
  }
}
