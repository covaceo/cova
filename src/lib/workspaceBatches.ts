import type { WorkspaceWrite, WorkspaceRecord } from "./workspaceModel";
import { assertWrites, uuid } from "./workspaceValidation";
export const planKey = (owner: string) =>
  "cova-workspace-plan-v2:" + encodeURIComponent(owner);
export type BatchPlan = {
  owner: string;
  version: 2;
  metadata: { backupId: string; contentHash: string };
  batches: { id: string; records: WorkspaceWrite[] }[];
  next: number;
};
export function readWorkspaceBatchPlan(owner: string): BatchPlan | null {
  const raw = localStorage.getItem(planKey(owner));
  if (!raw) return null;
  const p = JSON.parse(raw);
  if (
    p.owner !== owner ||
    p.version !== 2 ||
    !Array.isArray(p.batches) ||
    !p.batches.length ||
    !Number.isInteger(p.next) ||
    p.next < 0 ||
    p.next > p.batches.length ||
    !uuid(p.metadata?.backupId) ||
    !/^[a-f0-9]{64}$/.test(p.metadata?.contentHash)
  )
    throw Error(
      "Invalid pending save. Preserve this browser and export a backup.",
    );
  for (const b of p.batches) {
    if (!uuid(b.id)) throw Error("Invalid operation");
    assertWrites(b.records);
  }
  return p;
}
function persist(plan: BatchPlan) {
  const s = JSON.stringify(plan);
  localStorage.setItem(planKey(plan.owner), s);
  if (localStorage.getItem(planKey(plan.owner)) !== s)
    throw Error("Pending save could not be safely stored.");
}
export function prepareWorkspaceBatches(
  owner: string,
  writes: WorkspaceWrite[],
  metadata: BatchPlan["metadata"],
): BatchPlan | null {
  if (readWorkspaceBatchPlan(owner))
    throw Error("Resume the pending save before preparing another.");
  if (!writes.length) return null;
  if (
    writes.length > 25000 ||
    new TextEncoder().encode(JSON.stringify(writes)).length > 2800000
  )
    throw Error(
      "This copy exceeds the safe atomic transfer limit. Keep this browser copy; no upload has started.",
    );
  const batches = [];
  for (let i = 0; i < writes.length; i += 500) {
    const records = structuredClone(writes.slice(i, i + 500));
    assertWrites(records);
    if (new TextEncoder().encode(JSON.stringify(records)).length > 3900000)
      throw Error("This batch is too large. Your browser copy is unchanged.");
    batches.push({ id: crypto.randomUUID(), records });
  }
  const p: BatchPlan = { owner, version: 2, metadata, batches, next: 0 };
  persist(p);
  return p;
}
// Caller must hold an exclusive Web Lock for this owner across preparation/send.
export async function sendWorkspaceBatches(
  owner: string,
  client: {
    apply: (
      id: string,
      rows: WorkspaceWrite[],
      metadata: unknown,
    ) => Promise<{ records: WorkspaceRecord[] }>;
  },
  current: () => boolean,
) {
  const plan = readWorkspaceBatchPlan(owner);
  if (!plan) return;
  const records = plan.batches.flatMap((b) => b.records);
  if (plan.next === plan.batches.length) return;
  if (!current()) throw Error("Account or browser state changed.");
  // New atomic-plan RPC: all chunks commit together or all roll back. The first
  // persisted operation ID is stable across lost responses and process restarts.
  await client.apply(plan.batches[0].id, records, plan.metadata);
  if (!current()) throw Error("Account changed. Resume when signed in again.");
  plan.next = plan.batches.length;
  persist(plan);
  // Keep the plan until the caller verifies an authoritative complete load.
}
export function finishWorkspaceBatches(owner: string) {
  localStorage.removeItem(planKey(owner));
}
