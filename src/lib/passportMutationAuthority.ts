// In-memory, owner-scoped authority. Events notify mounted consumers; snapshots
// also cover writes begun before subscription and synchronous same-task checks.
export const PASSPORT_DATA_CHANGE_EVENT = 'cova:passport-data-change';
type PassportMutationState = Readonly<{ pendingCount: number; epoch: number }>;
const idle: PassportMutationState = Object.freeze({ pendingCount: 0, epoch: 0 });
const owners = new Map<string, PassportMutationState>();

export function readPassportMutationAuthority(owner: string | undefined): PassportMutationState {
  return owner === undefined ? idle : owners.get(owner) ?? idle;
}

export function beginPassportMutation(owner: string): () => void {
  const change = (delta: number) => {
    const previous = readPassportMutationAuthority(owner);
    const next = Object.freeze({ pendingCount: previous.pendingCount + delta, epoch: previous.epoch + 1 });
    owners.set(owner, next);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PASSPORT_DATA_CHANGE_EVENT, {
      detail: Object.freeze({ owner, pending: next.pendingCount > 0, ...next }),
    }));
  };
  change(1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    change(-1);
  };
}
