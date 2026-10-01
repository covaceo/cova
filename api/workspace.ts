import { createHash } from "node:crypto";
import {
  ApiError,
  requirePolicyAcceptedUser,
  sendApiError,
} from "./_lib/auth.js";
import { supabaseServiceHeaders } from "./_lib/supabase.js";
import {
  assertRecords,
  assertWrites,
  uuid,
  WORKSPACE_DISCLOSURE,
} from "../src/lib/workspaceValidation";

export class WorkspaceOperationRejection extends ApiError {
  constructor(status: number, message: string, public rejectedOperationId: string, public rejectionCode: string) {
    super(status, message);
  }
}
async function workspaceRest(path: string, options: any = {}) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new ApiError(503, "Account storage is unavailable.");
  const url = new URL(base + "/rest/v1/" + path);
  for (const [k, v] of Object.entries(options.query || {}))
    url.searchParams.set(k, String(v));
  const response = await fetch(url, {
    method: options.body === undefined ? "GET" : "POST",
    headers: supabaseServiceHeaders(key, {
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    }),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = String(data?.message || "");
    if (["revision_conflict", "deleted_record", "trade_account_changed", "missing_delete_target"].includes(message))
      throw new WorkspaceOperationRejection(409,
        "A newer change exists. Review the account copy before saving.", options.body?.p_operation, message);
    if (/incomplete_other_batch|missing_batch_start/.test(message))
      throw new ApiError(
        423,
        "An account copy is incomplete. Resume its original browser.",
      );
    if (message === "consent_required")
      throw new ApiError(403, "Enable account storage first.");
    if (message === "trade_cap_exceeded")
      throw new WorkspaceOperationRejection(422, "Your saved trade limit would be exceeded. Correct your browser copy and reload to review.", options.body?.p_operation, message);
    throw new ApiError(503, "Account storage is unavailable.");
  }
  return data;
}
export function createWorkspaceHandler({
  auth = requirePolicyAcceptedUser,
  rest = workspaceRest,
  enabled = () => process.env.WORKSPACE_SYNC_ENABLED === "true",
}: any = {}) {
  return async (req: any, res: any) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!enabled())
      return res.status(404).json({ error: "Account storage is not enabled." });
    if (!["GET", "POST"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      const user = await auth(req);
      if (!uuid(user.id)) throw new ApiError(401, "Sign in again.");
      let body = req.method === "GET" ? undefined : req.body;
      if (typeof body === "string") {
        if (Buffer.byteLength(body) > 4000000)
          throw new ApiError(413, "Too many changes for one request.");
        try {
          body = JSON.parse(body);
        } catch {
          throw new ApiError(400, "Invalid request.");
        }
      }
      if (body && Buffer.byteLength(JSON.stringify(body)) > 4000000)
        throw new ApiError(413, "Too many changes for one request.");
      const url = new URL(req.url || "/api/workspace", "https://cova.invalid");
      if (
        (req.method === "GET" ? url.searchParams.get("owner") : body?.owner) !==
        user.id
      )
        throw new ApiError(409, "Your session changed. Sign in again.");
      const settings = async () => {
        const rows = await rest("workspace_settings", {
          query: {
            owner_id: "eq." + user.id,
            select: "disclosure_version,revision,pending_manifest",
            limit: "1",
          },
        });
        if (!Array.isArray(rows)) throw Error("Invalid settings");
        return rows[0] || null;
      };
      if (req.method === "GET") {
        const offset = Number(url.searchParams.get("offset") || "0");
        const byteOffset = Number(url.searchParams.get("byteOffset") || "0");
        const expected = url.searchParams.get("revision");
        if (!Number.isSafeInteger(offset) || offset < 0 ||
            !Number.isSafeInteger(byteOffset) || byteOffset < 0 ||
            (expected !== null && (!/^\d+$/.test(expected) || !Number.isSafeInteger(Number(expected)))) ||
            ((offset || byteOffset) && expected === null))
          throw new ApiError(400, "Invalid snapshot cursor.");
        const before = await settings();
        const revision = before?.revision || 0;
        if (expected !== null && Number(expected) !== revision)
          throw new ApiError(409, "Account changed while loading. Retry.");
        if (before?.pending_manifest)
          return res.status(200).json({owner:user.id,consent:true,pendingWrite:before.pending_manifest,
            revision,chunk:"",next:null});
        const page = await rest("workspace_records", {query:{
          owner_id:"eq."+user.id,
          select:"kind,record_id,account_id,schema_version,payload,revision,created_at,updated_at,deleted_at",
          order:"kind.asc,record_id.asc",limit:"250",offset:String(offset),
        }});
        if (!Array.isArray(page)) throw Error("Invalid page");
        const records = page.map((r:any)=>({kind:r.kind,recordId:r.record_id,accountId:r.account_id,
          schemaVersion:r.schema_version,payload:r.payload,revision:r.revision,
          createdAt:r.created_at,updatedAt:r.updated_at,deletedAt:r.deleted_at}));
        assertRecords(records);
        // NDJSON byte fragments also support a single large legacy record. No
        // partial row/page is usable until the client completes the snapshot.
        const encoded = Buffer.from(records.map((r:any)=>JSON.stringify(r)+"\n").join(""));
        if (byteOffset > encoded.length) throw new ApiError(400,"Invalid snapshot cursor.");
        const end = Math.min(encoded.length,byteOffset+1048576);
        const next = end < encoded.length ? {offset,byteOffset:end} :
          (page.length ? {offset:offset+page.length,byteOffset:0} : null);
        const after = await settings();
        if (JSON.stringify(before)!==JSON.stringify(after))
          throw new ApiError(409,"Account changed while loading. Retry.");
        const result={owner:user.id,consent:before?.disclosure_version===WORKSPACE_DISCLOSURE,
          pendingWrite:null,revision,chunk:encoded.subarray(byteOffset,end).toString("base64"),next};
        // 1 MiB bytes expand to <1.4 MiB base64, well below platform limits.
        if (Buffer.byteLength(JSON.stringify(result))>1500000) throw Error("Snapshot page exceeds byte budget");
        return res.status(200).json(result);
      }
      if (body?.action === "consent") {
        if (
          body.disclosure !== WORKSPACE_DISCLOSURE ||
          Object.keys(body).some(
            (k) => !["owner", "action", "disclosure"].includes(k),
          )
        )
          throw new ApiError(400, "Confirm the account storage disclosure.");
        await rest("workspace_settings", {
          body: { owner_id: user.id, disclosure_version: WORKSPACE_DISCLOSURE },
          query: { on_conflict: "owner_id" },
          prefer: "resolution=ignore-duplicates,return=representation",
        });
        return res.status(200).json({ owner: user.id, consent: true });
      }
      if (
        body?.action !== "apply" ||
        !uuid(body.operationId) ||
        Object.keys(body).some(
          (k) =>
            ![
              "action",
              "owner",
              "operationId",
              "records",
              "migration",
            ].includes(k),
        )
      )
        throw new ApiError(400, "Invalid save request.");
      try {
        assertWrites(body.records, 25000);
        const m = body.migration;
        if (m !== undefined && m !== null) {
          if (
            !m ||
            typeof m !== "object" ||
            !uuid(m.backupId) ||
            !/^[a-f0-9]{64}$/.test(m.contentHash) ||
            Object.keys(m).some(
              (k) =>
                ![
                  "backupId",
                  "contentHash",
                  "batch",
                  "totalBatches",
                  "totalChanges",
                ].includes(k),
            )
          )
            throw Error();
          if (
            m.totalBatches !== undefined &&
            (!Number.isSafeInteger(m.totalBatches) ||
              m.totalBatches < 2 ||
              m.totalBatches > 20000 ||
              !Number.isSafeInteger(m.batch) ||
              m.batch < 0 ||
              m.batch >= m.totalBatches ||
              !Number.isSafeInteger(m.totalChanges))
          )
            throw Error();
        }
      } catch {
        throw new ApiError(
          400,
          "Invalid workspace change. Originals remain in your browser.",
        );
      }
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            records: body.records,
            migration: body.migration ?? null,
          }),
        )
        .digest("hex");
      const result = await rest("rpc/cova_apply_workspace_plan", {
        body: {
          p_owner: user.id,
          p_operation: body.operationId,
          p_hash: hash,
          p_records: body.records,
          p_migration: body.migration ?? null,
          p_max_trades: user.plan === "pro" ? null : 25,
        },
      });
      assertRecords(result.records);
      return res.status(200).json({ operationId: result.operationId, owner: user.id, records: [], applied: true });
    } catch (e) {
      if (e instanceof ApiError && (e as any).rejectedOperationId)
        return res.status(e.statusCode).json({ error: e.message,
          rejectedOperationId: (e as any).rejectedOperationId,
          rejectionCode: (e as any).rejectionCode });
      return sendApiError(
        res,
        e,
        "Account storage could not complete this request.",
      );
    }
  };
}
export default createWorkspaceHandler();
