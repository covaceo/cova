// Newly implemented from TEST schema evidence; not recovered deployment source.
export type WorkspaceKind =
  "trade" | "rules" | "daily_note" | "account" | "broker_cash";
export type WorkspaceValue = {
  kind: WorkspaceKind;
  recordId: string;
  accountId: string;
  schemaVersion: 1;
  payload: Record<string, unknown>;
};
export type WorkspaceRecord = WorkspaceValue & {
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type WorkspaceWrite = WorkspaceValue & {
  expectedRevision: number;
  deleted: boolean;
};

// Matches the database primary key within ONE authenticated owner's workspace.
// Owners must be validated by the boundary; never combine owners in these arrays.
export const workspaceKey = (row: Pick<WorkspaceValue, "kind" | "recordId">) =>
  JSON.stringify([row.kind, row.recordId]);

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonical((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  }
  throw new Error("Workspace payload must be JSON.");
}

export function workspaceEqual(a: WorkspaceValue, b: WorkspaceValue): boolean {
  return (
    workspaceKey(a) === workspaceKey(b) &&
    a.accountId === b.accountId &&
    a.schemaVersion === b.schemaVersion &&
    canonical(a.payload) === canonical(b.payload)
  );
}

function unique<T extends WorkspaceValue>(rows: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = workspaceKey(row);
    if (result.has(key)) throw new Error("Duplicate workspace identity.");
    result.set(key, row);
  }
  return result;
}

function revision(row: WorkspaceRecord) {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error("Invalid workspace revision.");
  return row.revision;
}

export function workspacePreview(
  local: readonly WorkspaceValue[],
  remote: readonly WorkspaceRecord[],
) {
  const browser = unique(local),
    cloud = unique(remote);
  const added: WorkspaceValue[] = [],
    conflicts: { local: WorkspaceValue; remote: WorkspaceRecord }[] = [];
  let matching = 0,
    cloudOnly = 0;
  for (const row of cloud.values()) {
    revision(row);
    if (!row.deletedAt && !browser.has(workspaceKey(row))) cloudOnly++;
  }
  for (const row of browser.values()) {
    const previous = cloud.get(workspaceKey(row));
    if (!previous) added.push(row);
    else if (!previous.deletedAt && workspaceEqual(row, previous)) matching++;
    else conflicts.push({ local: row, remote: previous });
  }
  return { added, conflicts, matching, cloudOnly };
}

// Only use after complete hydration and explicit consent/review. A missing local
// row in a loading/failed/partial snapshot MUST NOT be interpreted as deletion.
// The explicit completeness argument intentionally differs from recovered callers.
export function workspaceDiff(
  local: readonly WorkspaceValue[],
  baseline: readonly WorkspaceRecord[],
  complete: boolean,
): WorkspaceWrite[] {
  if (!complete)
    throw new Error("Cannot diff an incomplete workspace snapshot.");
  const current = unique(local),
    prior = unique(baseline);
  const writes: WorkspaceWrite[] = [];
  for (const previous of prior.values()) revision(previous);
  for (const row of current.values()) {
    const previous = prior.get(workspaceKey(row));
    if (previous?.deletedAt)
      throw new Error(
        "Deleted workspace record requires explicit recovery with a new identity.",
      );
    if (previous?.kind === "trade" && previous.accountId !== row.accountId)
      throw new Error("Trade account cannot change.");
    if (!previous || !workspaceEqual(row, previous))
      writes.push({
        ...structuredClone(row),
        expectedRevision: previous?.revision ?? 0,
        deleted: false,
      });
  }
  for (const previous of prior.values()) {
    if (!previous.deletedAt && !current.has(workspaceKey(previous)))
      writes.push({
        kind: previous.kind,
        recordId: previous.recordId,
        accountId: previous.accountId,
        schemaVersion: 1,
        payload: {},
        expectedRevision: previous.revision,
        deleted: true,
      });
  }
  return writes;
}

// An old operation receipt may arrive after a newer authoritative load.
export function mergeWorkspaceReceipt(
  baseline: readonly WorkspaceRecord[],
  receipt: readonly WorkspaceRecord[],
): WorkspaceRecord[] {
  const merged = unique(baseline),
    received = unique(receipt);
  for (const row of baseline) revision(row);
  for (const row of received.values()) {
    revision(row);
    const previous = merged.get(workspaceKey(row));
    if (previous && previous.revision > row.revision) continue;
    if (previous && previous.revision === row.revision) {
      if (
        !workspaceEqual(previous, row) ||
        previous.deletedAt !== row.deletedAt ||
        previous.createdAt !== row.createdAt ||
        previous.updatedAt !== row.updatedAt
      )
        throw new Error("Inconsistent workspace receipt.");
      continue;
    }
    if (previous?.deletedAt && !row.deletedAt)
      throw new Error("Receipt would revive a deleted record.");
    if (previous?.kind === "trade" && previous.accountId !== row.accountId)
      throw new Error("Receipt changes trade account.");
    merged.set(workspaceKey(row), row);
  }
  return structuredClone([...merged.values()]);
}
