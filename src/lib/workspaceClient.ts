import { readCompleteWorkspace, type SnapshotCursor } from "./workspaceSnapshot";
import { getSupabaseClient } from "./supabaseClient";
import { getActiveStorageIdentity } from "./storageScope";
import {
  assertRecords,
  assertWrites,
  WORKSPACE_DISCLOSURE,
} from "./workspaceValidation";
import type { WorkspaceRecord, WorkspaceWrite } from "./workspaceModel";
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 503,
    public definitiveRejection = false,
  ) {
    super(message);
  }
}
export const workspaceFeatureEnabled = () =>
  (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_WORKSPACE_SYNC_ENABLED === "true";
export const workspaceOwnerCurrent = (owner: string) =>
  getActiveStorageIdentity() === encodeURIComponent(owner.trim().toLowerCase());
export type WorkspaceSnapshot = {
  owner: string;
  records: WorkspaceRecord[];
  consent: boolean;
  revision: number;
  pendingWrite: null | {
    id: string;
    nextBatch: number;
    totalBatches: number;
    totalChanges: number;
    contentHash: string;
  };
};
export function createWorkspaceClient(owner: string) {
  async function request(body?: unknown, cursor?: SnapshotCursor) {
    if (!workspaceOwnerCurrent(owner))
      throw new WorkspaceError("Your active account changed.", 401);
    const client = getSupabaseClient(),
      session = client ? await client.auth.getSession() : null;
    if (
      !workspaceOwnerCurrent(owner) ||
      session?.data.session?.user.id !== owner
    )
      throw new WorkspaceError("Sign in to this account again.", 401);
    let response: Response;
    try {
      response = await fetch(
        "/api/workspace" + (body ? "" : "?owner=" + encodeURIComponent(owner) + (cursor ? "&" + new URLSearchParams(Object.entries(cursor).map(([k,v])=>[k,String(v)])).toString() : "")),
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: "Bearer " + session.data.session.access_token,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      throw new WorkspaceError(
        "Offline or save response unavailable. Your browser draft is kept.",
      );
    }
    const data = await response.json();
    if (!workspaceOwnerCurrent(owner))
      throw new WorkspaceError("Your active account changed.", 401);
    if (!response.ok)
      throw new WorkspaceError(
        data.error || "Account storage unavailable.",
        response.status,
        !!body && (body as any).action === "apply" &&
          response.status === (data.rejectionCode === "trade_cap_exceeded" ? 422 : 409) &&
          data.rejectedOperationId === (body as any).operationId &&
          ["revision_conflict", "deleted_record", "trade_account_changed",
            "missing_delete_target", "trade_cap_exceeded"].includes(data.rejectionCode),
      );
    if (data.owner !== owner)
      throw new WorkspaceError("Account response did not match.", 403);
    return data;
  }
  return {
    load: (): Promise<WorkspaceSnapshot> => readCompleteWorkspace(owner, cursor => request(undefined,cursor)),
    consent: () =>
      request({ owner, action: "consent", disclosure: WORKSPACE_DISCLOSURE }),
    apply: async (
      id: string,
      records: WorkspaceWrite[],
      migration?: unknown,
    ) => {
      assertWrites(records, 25000);
      const r = await request({
        owner,
        action: "apply",
        operationId: id,
        records,
        migration,
      });
      assertRecords(r.records);
      if (r.operationId !== id) throw Error("Unexpected save receipt");
      return r as { records: WorkspaceRecord[]; operationId: string };
    },
  };
}
const cacheKey = (owner: string) =>
  "cova-workspace-cache-v2:" + encodeURIComponent(owner);
export function readWorkspaceCache(owner: string): WorkspaceRecord[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(owner)) || "null");
    if (v?.owner !== owner) return null;
    assertRecords(v.records);
    return v.records;
  } catch {
    return null;
  }
}
export function saveWorkspaceCache(owner: string, records: WorkspaceRecord[]) {
  assertRecords(records);
  const data = JSON.stringify({ owner, records });
  localStorage.setItem(cacheKey(owner), data);
  if (localStorage.getItem(cacheKey(owner)) !== data)
    throw Error("Account cache could not be verified.");
}
