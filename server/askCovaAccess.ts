import { uuid } from '../src/lib/workspaceValidation';

// Server-only, single-account gate. Callers supply the policy-verified auth user,
// never a request body, email, user metadata or a frontend capability flag.
export function hasAskCovaAccess(
  environment: Record<string, unknown> | null | undefined,
  user: { id?: unknown } | null | undefined,
): boolean {
  const invitedId = environment?.ASK_COVA_BETA_USER_ID;
  return environment?.ASK_COVA_ENABLED === 'true' &&
    uuid(invitedId) && invitedId.length === 36 &&
    uuid(user?.id) && user.id === invitedId;
}
