export type ImportPrincipal = {
  authGeneration: number;
  identityGeneration: number;
  identity: string;
};

type ImportSessionIdentity = {
  email?: string | null;
  userId?: string | null;
};

export function toImportPrincipalIdentity(session: ImportSessionIdentity | null | undefined) {
  if (!session) return "";
  return session.userId?.trim() || session.email?.trim().toLowerCase() || "";
}

export function isImportPrincipalCurrent(start: ImportPrincipal | null, current: ImportPrincipal | null) {
  return Boolean(
    start
    && current
    && start.authGeneration === current.authGeneration
    && start.identityGeneration === current.identityGeneration
    && start.identity === current.identity,
  );
}
