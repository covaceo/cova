import { assertRecords } from "./workspaceValidation";
import type { WorkspaceRecord } from "./workspaceModel";
export type SnapshotCursor = { offset: number; byteOffset: number; revision?: number };

// Never expose partial pages as an authoritative workspace. A concurrent write
// invalidates the entire read; retry from zero, including decoder/buffer state.
export async function readCompleteWorkspace(owner: string, page: (cursor: SnapshotCursor) => Promise<any>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let cursor: SnapshotCursor = { offset: 0, byteOffset: 0 };
      let first: any = null, pending = "";
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const records: WorkspaceRecord[] = [];
      while (true) {
        const result = await page(cursor);
        if (result.owner !== owner || !Number.isSafeInteger(result.revision) || result.revision < 0 ||
            typeof result.consent !== "boolean" || typeof result.chunk !== "string" ||
            result.chunk.length > 1400000) throw Error("Invalid snapshot page.");
        if (first && (result.revision !== first.revision || result.consent !== first.consent))
          throw Object.assign(Error("Account changed while loading."), { status: 409 });
        first ??= result;
        if (result.pendingWrite) {
          if (cursor.offset || cursor.byteOffset) throw Object.assign(Error("Account copy changed."), { status: 409 });
          return { ...result, records: [] };
        }
        const bytes = Uint8Array.from(atob(result.chunk), c => c.charCodeAt(0));
        pending += decoder.decode(bytes, { stream: true });
        let newline: number;
        while ((newline = pending.indexOf("\n")) >= 0) {
          records.push(JSON.parse(pending.slice(0, newline)));
          pending = pending.slice(newline + 1);
        }
        if (result.next === null) {
          pending += decoder.decode();
          if (pending) throw Error("Incomplete snapshot record.");
          assertRecords(records);
          return { owner, consent: result.consent, revision: result.revision, pendingWrite: null, records };
        }
        const next = result.next;
        if (!Number.isSafeInteger(next?.offset) || !Number.isSafeInteger(next?.byteOffset) ||
            next.offset < cursor.offset || next.byteOffset < 0 ||
            (next.offset === cursor.offset && next.byteOffset <= cursor.byteOffset) ||
            (next.offset > cursor.offset && next.byteOffset !== 0))
          throw Error("Invalid snapshot cursor.");
        cursor = { ...next, revision: result.revision };
      }
    } catch (err) {
      if ((err as { status?: number })?.status !== 409 || attempt === 2) throw err;
    }
  }
  throw Error("Account changed while loading.");
}
