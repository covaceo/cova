import {
  commitWorkspaceHydration,
  recoverWorkspaceHydration,
} from "../lib/workspaceHydration";
// New orchestration, not the recovered TEST hook. No writes without local consent.
import { useEffect, useRef, useState } from "react";
import type { RiskRule, Trade } from "../lib/risk";
import {
  collectWorkspaceLocal,
  saveWorkspaceBackup,
  workspaceHash,
  WORKSPACE_LOCAL_EVENT,
} from "../lib/workspaceLocal";
import {
  workspaceDiff,
  recreateDailyNote,
  workspaceEqual,
  workspaceKey,
  workspacePreview,
  type WorkspaceRecord,
  type WorkspaceWrite,
} from "../lib/workspaceModel";
import {
  createWorkspaceClient,
  readWorkspaceCache,
  saveWorkspaceCache,
  workspaceFeatureEnabled,
  workspaceOwnerCurrent,
  WorkspaceError,
} from "../lib/workspaceClient";
import {
  prepareWorkspaceBatches,
  readWorkspaceBatchPlan,
  sendWorkspaceBatches,
  finishWorkspaceBatches,
} from "../lib/workspaceBatches";
import { assertValue } from "../lib/workspaceValidation";
const localKey = (owner: string) =>
  "cova-workspace-mode-v2:" + encodeURIComponent(owner);
const ledgerKey = (owner: string) =>
  "cova-react-risk-os-v2:" + encodeURIComponent(owner);
type Phase =
  "disabled" | "loading" | "review" | "saved" | "saving" | "error" | "local";
export function useWorkspaceSync(
  owner: string | undefined,
  trades: Trade[],
  rules: RiskRule[],
  hydrate: (trades: Trade[], rules: RiskRule[]) => void,
) {
  const enabled = workspaceFeatureEnabled() && !!owner;
  const [phase, setPhase] = useState<Phase>(enabled ? "loading" : "disabled"),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0),
    [preview, setPreview] = useState<ReturnType<
      typeof workspacePreview
    > | null>(null),
    [issues, setIssues] = useState<string[]>([]),
    [deletions, setDeletions] = useState<WorkspaceWrite[]>([]);
  const state = useRef({ owner, trades, rules, hydrate });
  state.current = { owner, trades, rules, hydrate };
  const epoch = useRef(0),
    readyOwner = useRef<string>(),
    baseline = useRef<WorkspaceRecord[]>([]),
    consented = useRef(false),
    busy = useRef(false),
    applied = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const current = (o: string, e: number) =>
    state.current.owner === o &&
    epoch.current === e &&
    workspaceOwnerCurrent(o) &&
    enabledRef.current;
  const snapshot = async (o: string) => {
    const s = await collectWorkspaceLocal(
      o,
      state.current.trades,
      state.current.rules,
      { includeRules: localStorage.getItem(ledgerKey(o)) !== null },
    );
    for (const r of s.records) assertValue(r);
    return s;
  };
  const apply = (o: string, records: WorkspaceRecord[]) => {
    const l = commitWorkspaceHydration(o, records, state.current.rules);
    localStorage.removeItem(localKey(o));
    baseline.current = records;
    readyOwner.current = o;
    applied.current = true;
    state.current.hydrate(l.trades, l.rules);
    setPreview(null);
    setError("");
    setPhase("saved");
  };
  const lock = async <T,>(o: string, fn: () => Promise<T>) => {
    if (!navigator.locks)
      throw Error(
        "This browser cannot safely coordinate account saves. Keep browser-only mode.",
      );
    return navigator.locks.request(
      "cova-workspace:" + o,
      { mode: "exclusive", ifAvailable: true },
      async (held) => {
        if (!held)
          throw Error(
            "Another tab is saving this account. Retry after it finishes.",
          );
        return fn();
      },
    );
  };
  async function load() {
    if (!owner || !enabled) return;
    const o = owner,
      e = ++epoch.current;
    readyOwner.current = undefined;
    busy.current = true;
    setPhase("loading");
    setError("");
    try {
      await lock(o, async () => {
        const recovered = recoverWorkspaceHydration(o);
        if (recovered) {
          state.current.trades = recovered.trades;
          state.current.rules = recovered.rules;
          state.current.hydrate(recovered.trades, recovered.rules);
        }
        const client = createWorkspaceClient(o);
        let cloud = await client.load();
        if (!current(o, e)) return;
        const plan = readWorkspaceBatchPlan(o);
        if (
          cloud.pendingWrite &&
          cloud.pendingWrite.id !== plan?.metadata.backupId
        )
          throw new WorkspaceError(
            "Another device has an incomplete account copy. Resume that browser.",
            423,
          );
        if (plan) {
          try {
            await sendWorkspaceBatches(o, client, () => current(o, e));
          } catch (err) {
            if (err instanceof WorkspaceError && err.definitiveRejection) {
              finishWorkspaceBatches(o);
            } else throw err;
          }
          cloud = await client.load();
          if (!current(o, e)) return;
          if (cloud.pendingWrite)
            throw Error("Account copy remains incomplete.");
          if (readWorkspaceBatchPlan(o))
            for (const b of plan.batches)
              for (const w of b.records) {
                const r = cloud.records.find(
                  (r) => workspaceKey(r) === workspaceKey(w),
                );
                if (!r || r.revision <= w.expectedRevision)
                  throw Error("Save receipt could not be verified.");
              }
          finishWorkspaceBatches(o);
        }
        const local = await snapshot(o);
        if (!current(o, e)) return;
        const old = readWorkspaceCache(o);
        baseline.current = cloud.records;
        consented.current = cloud.consent;
        const compare = workspacePreview(
          local.records,
          cloud.records.filter((r) => r.kind !== "broker_cash"),
        );
        const missing = old
          ? old
              .filter(
                (r) =>
                  !r.deletedAt &&
                  r.kind !== "broker_cash" &&
                  !local.records.some(
                    (v) => workspaceKey(v) === workspaceKey(r),
                  ),
              )
              .map((r) => ({
                kind: r.kind,
                recordId: r.recordId,
                accountId: r.accountId,
                schemaVersion: r.schemaVersion,
                payload: {},
                expectedRevision: r.revision,
                deleted: true,
              }))
          : [];
        setDeletions(missing);
        setIssues(local.issues.map((i) => i.reason));
        // Clean means exact agreement with the acknowledged active records.
        // A local value at a cached tombstone is a review conflict, not a diff
        // to send (and not an error that prevents reaching explicit review).
        const acknowledged = old ? workspacePreview(
          [...local.records, ...old.filter((r) => r.kind === "broker_cash" && !r.deletedAt)],
          old,
        ) : null;
        const clean = acknowledged && !acknowledged.added.length &&
          !acknowledged.conflicts.length && !acknowledged.cloudOnly;
        if (
          cloud.consent &&
          (clean ||
            (!compare.added.length &&
              !compare.conflicts.length &&
              !missing.length))
        )
          apply(o, cloud.records);
        else {
          setPreview(compare);
          setPhase("review");
        }
      });
    } catch (err) {
      if (current(o, e)) {
        setError(err instanceof Error ? err.message : "Account load failed.");
        setPhase("error");
      }
    } finally {
      if (current(o, e)) busy.current = false;
    }
  }
  useEffect(() => {
    readyOwner.current = undefined;
    baseline.current = [];
    consented.current = false;
    setPreview(null);
    setError("");
    if (!enabled || !owner) {
      epoch.current++;
      setPhase("disabled");
      return;
    }
    if (localStorage.getItem(localKey(owner)) === "local") {
      epoch.current++;
      readyOwner.current = owner;
      setPhase("local");
      return;
    }
    void load();
    return () => {
      epoch.current++;
    };
  }, [owner, enabled]);
  useEffect(() => {
    const notify = () => setTick((n) => n + 1);
    const other = (ev: StorageEvent) => {
      if (ev.key?.startsWith("cova-journal-draft-v1:")) return;
      if (
        owner &&
        ev.key?.endsWith(":" + encodeURIComponent(owner)) &&
        phaseRef.current !== "local"
      ) {
        epoch.current++;
        phaseRef.current = "error";
        // Retain mounted same-owner editors and drafts; commits are blocked by phase.
        setError(
          "This account changed in another tab. Reload and review before continuing.",
        );
        setPhase("error");
      }
    };
    window.addEventListener(WORKSPACE_LOCAL_EVENT, notify);
    window.addEventListener("storage", other);
    return () => {
      window.removeEventListener(WORKSPACE_LOCAL_EVENT, notify);
      window.removeEventListener("storage", other);
    };
  }, [owner]);
  useEffect(() => {
    if (
      !owner ||
      !enabled ||
      phase !== "saved" ||
      readyOwner.current !== owner ||
      busy.current
    )
      return;
    if (applied.current) {
      applied.current = false;
      return;
    }
    const o = owner,
      e = epoch.current;
    const timer = setTimeout(
      () =>
        void (async () => {
          busy.current = true;
          try {
            const local = await snapshot(o);
            if (!current(o, e)) return;
            if (local.issues.some((i) => i.kind !== "broker_cash"))
              throw Error(
                "Some browser records need review before automatic saving. Reload and review migration details.",
              );
            const values = [
              ...local.records,
              ...baseline.current.filter(
                (r) => r.kind === "broker_cash" && !r.deletedAt,
              ),
            ];
            const preview = workspacePreview(values, baseline.current);
            if (preview.conflicts.some(({ remote }) => remote.deletedAt)) {
              setPreview(preview);
              setDeletions(workspaceDiff(values.filter((v) => !baseline.current.some(
                (r) => r.deletedAt && workspaceKey(r) === workspaceKey(v))), baseline.current, true)
                .filter((w) => w.deleted));
              setPhase("review");
              return;
            }
            const writes = workspaceDiff(values, baseline.current, true);
            if (!writes.length) return;
            setPhase("saving");
            await lock(o, async () => {
              const backup = {
                backupId: crypto.randomUUID(),
                contentHash: await workspaceHash(local.records),
              };
              if (!current(o, e)) return;
              prepareWorkspaceBatches(o, writes, {
                backupId: backup.backupId,
                contentHash: backup.contentHash,
              });
              const client = createWorkspaceClient(o);
              await sendWorkspaceBatches(o, client, () => current(o, e));
              const cloud = await client.load();
              if (!current(o, e)) return;
              if (cloud.pendingWrite)
                throw Error("Account copy remains incomplete.");
              finishWorkspaceBatches(o);
              baseline.current = cloud.records;
              // Never replace the current browser ledger with a write response. Newer edits
              // are reconciled on the next render; remote-only changes require review.
              const latest = await snapshot(o);
              if (!current(o, e)) return;
              const p = workspacePreview(
                latest.records,
                cloud.records.filter((r) => r.kind !== "broker_cash"),
              );
              if (p.conflicts.length || p.cloudOnly) {
                setPreview(p);
                setPhase("review");
              } else {
                saveWorkspaceCache(o, cloud.records);
                setPhase("saved");
              }
            });
          } catch (err) {
            if (current(o, e)) {
              if (err instanceof WorkspaceError && err.definitiveRejection)
                finishWorkspaceBatches(o);
              setError(
                err instanceof Error ? err.message : "Account save failed.",
              );
              setPhase("error");
            }
          } finally {
            if (current(o, e)) busy.current = false;
          }
        })(),
      500,
    );
    return () => clearTimeout(timer);
  }, [owner, enabled, trades, rules, tick, phase]);
  async function choose(useBrowser: boolean) {
    if (!owner || busy.current) return;
    if (
      !window.dispatchEvent(
        new Event("cova:before-account-change", { cancelable: true }),
      )
    )
      return;
    const o = owner,
      e = epoch.current;
    busy.current = true;
    setPhase("saving");
    try {
      await lock(o, async () => {
        const local = await snapshot(o);
        const backup = await saveWorkspaceBackup(o, local);
        if (!current(o, e)) return;
        const client = createWorkspaceClient(o);
        const cloud = await client.load();
        if (!current(o, e)) return;
        if (cloud.pendingWrite)
          throw Error("Resume the incomplete account copy first.");
        // Recheck the displayed remote snapshot: user consent cannot approve unseen edits.
        if (JSON.stringify(cloud.records) !== JSON.stringify(baseline.current))
          throw Error("Account changed since review. Reload before choosing.");
        const writes: WorkspaceWrite[] = [];
        if (useBrowser)
          for (const v of local.records) {
            const r = cloud.records.find(
              (r) => workspaceKey(r) === workspaceKey(v),
            );
            if (r?.deletedAt) {
              if (v.kind === "daily_note") writes.push(recreateDailyNote(v, r));
              continue;
            }
            if (!r || !workspaceEqual(r, v))
              writes.push({
                ...v,
                expectedRevision: r?.revision ?? 0,
                deleted: false,
              });
          }
        if (useBrowser)
          for (const d of deletions) {
            const r = cloud.records.find(
              (r) => workspaceKey(r) === workspaceKey(d),
            );
            if (r && !r.deletedAt)
              writes.push({ ...d, expectedRevision: r.revision });
          }
        if (!cloud.consent) await client.consent();
        if (!current(o, e)) return;
        consented.current = true;
        prepareWorkspaceBatches(o, writes, {
          backupId: backup.backupId,
          contentHash: backup.contentHash,
        });
        await sendWorkspaceBatches(o, client, () => current(o, e));
        const verified = await client.load();
        if (!current(o, e)) return;
        if (verified.pendingWrite)
          throw Error("Account copy remains incomplete.");
        for (const w of writes) {
          const r = verified.records.find(
            (r) => workspaceKey(r) === workspaceKey(w),
          );
          if (
            !r ||
            Boolean(r.deletedAt) !== w.deleted ||
            (!w.deleted && !workspaceEqual(r, w))
          )
            throw Error("A newer change exists. Reload to review.");
        }
        const latest = await snapshot(o);
        if (!current(o, e)) return;
        if (JSON.stringify(latest.records) !== JSON.stringify(local.records))
          throw Error(
            "Browser data changed during account copy. Reload to review; your newer browser data is retained.",
          );
        finishWorkspaceBatches(o);
        localStorage.removeItem(localKey(o));
        apply(o, verified.records);
      });
    } catch (err) {
      if (current(o, e)) {
        setError(err instanceof Error ? err.message : "Account copy failed.");
        setPhase("error");
      }
    } finally {
      if (current(o, e)) busy.current = false;
    }
  }
  const browserOnly = () => {
    if (!owner || busy.current) return;
    epoch.current++;
    localStorage.setItem(localKey(owner), "local");
    readyOwner.current = owner;
    setPhase("local");
    setError("");
  };
  return {
    enabled,
    owner,
    phase,
    error,
    preview,
    issues,
    deletions,
    choose,
    browserOnly,
    reload: () => {
      if (
        window.dispatchEvent(
          new Event("cova:before-account-change", { cancelable: true }),
        )
      )
        return load();
    },
    canEditNow: () => !enabledRef.current ||
      (!busy.current && readyOwner.current === state.current.owner &&
        !!state.current.owner && workspaceOwnerCurrent(state.current.owner) &&
        ["saved", "local"].includes(phaseRef.current)),
    hasWorkspace: !enabled || readyOwner.current === owner,
    allowEdit:
      !enabled ||
      (readyOwner.current === owner && ["saved", "local"].includes(phase)),
    canPublishPlan:
      !enabled || (readyOwner.current === owner && phase === "saved"),
  };
}
function reviewText(
  row: WorkspaceRecord | import("../lib/workspaceModel").WorkspaceValue,
) {
  const p = row.payload;
  if (row.kind === "daily_note")
    return (
      String(p.note || "(Empty note)") +
      (p.tradeId ? " · Linked trade: " + String(p.tradeId) : "")
    );
  if (row.kind === "rules")
    return (p.rules as RiskRule[])
      .map((r) => r.name + ": " + r.limit + (r.enabled ? "" : " (disabled)"))
      .join("; ");
  if (row.kind === "account") return String(p.name);
  if (row.kind === "trade")
    return [
      p.date,
      p.market,
      p.side,
      String(p.contracts) + " contracts",
      "P&L: " + p.pnl,
      p.notes,
    ]
      .filter(Boolean)
      .join(" · ");
  return "Saved account data";
}
export function WorkspaceSyncPanel({
  sync,
}: {
  sync: ReturnType<typeof useWorkspaceSync>;
}) {
  if (!sync.enabled) return null;
  const labels = {
    disabled: "",
    loading: "Loading account workspace…",
    review: "Review account storage",
    saved: "Saved to your account",
    saving: "Saving to your account…",
    error: "Account storage needs attention",
    local: "Saved on this browser only",
  };
  return (
    <section
      className="workspace-sync-panel m-4 rounded-xl border border-white/10 p-4 text-sm"
      aria-label="Account storage"
      aria-live="polite"
    >
      <p>{labels[sync.phase]}</p>
      {sync.error && (
        <p role="alert">
          {sync.error} Your browser copy and backups are retained.
        </p>
      )}
      {sync.issues.length > 0 && (
        <details>
          <summary>Migration details</summary>
          {sync.issues.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </details>
      )}
      {sync.phase === "review" && (
        <>
          <p>
            Enable private account storage for your trades, risk rules, notes
            and account names so they are available on your other devices. A
            verified browser backup is kept before copying. Review differences
            before replacing a saved version.
          </p>
          <p>
            Fee confirmations and CSV verification history stay on this device;
            you may need to reconfirm them elsewhere. Broker verification
            requires a fresh broker check. Custom pictures and GIFs are not
            uploaded.
          </p>
          <p>
            {sync.preview?.added.length} browser-only records ·{" "}
            {sync.preview?.conflicts.length} differences ·{" "}
            {sync.preview?.cloudOnly} account-only records ·{" "}
            {sync.deletions.length} pending browser deletions. Deleted account
            trades stay deleted. Choosing browser changes explicitly recreates listed deleted daily notes.
          </p>
          {sync.preview?.conflicts.map(({ local, remote }) => (
            <details key={workspaceKey(local)}>
              <summary>
                {local.kind.replace("_", " ")} · {local.accountId} ·{" "}
                {local.recordId}
              </summary>
              <p>Browser: {reviewText(local)}</p>
              <p>
                Account: {remote.deletedAt ? "Deleted" : reviewText(remote)}
              </p>
            </details>
          ))}
          <button
            className="button primary"
            onClick={() => {
              if (
                (!sync.preview?.conflicts.length && !sync.deletions.length) ||
                window.confirm(
                  "Use this browser’s version for every listed difference and apply the listed deletions? Listed deleted daily notes will be recreated; deleted trades stay deleted. Other account-only records are kept.",
                )
              )
                void sync.choose(true);
            }}
          >
            Back up and copy browser changes
          </button>
          <button
            className="button quiet"
            onClick={() => {
              if (
                window.confirm(
                  "Back up this browser and load the saved account copy?",
                )
              )
                void sync.choose(false);
            }}
          >
            Back up and use account copy
          </button>
        </>
      )}
      {["error", "saved", "local"].includes(sync.phase) && (
        <button className="button quiet" onClick={() => void sync.reload()}>
          Reload account and review
        </button>
      )}
      {["review", "error"].includes(sync.phase) && (
        <button className="button quiet" onClick={sync.browserOnly}>
          Keep browser only
        </button>
      )}
    </section>
  );
}
