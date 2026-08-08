import { createHash, randomUUID } from "node:crypto";

const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_SECONDS = 60;
const LOCK_SECONDS = 300;
const ALLOWED_PROVIDERS = new Set(["rithmic", "tradovate"]);

function configuredRedis(env) {
  const rawUrl = String(env.KV_REST_API_URL || "").replace(/\/$/, "");
  const token = String(env.KV_REST_API_TOKEN || "");
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Rithmic rate limiting is not configured.");
  }
  if (url.protocol !== "https:"
    || !url.hostname.endsWith(".upstash.io")
    || url.username
    || url.password
    || url.search
    || url.hash
    || token.length < 32
    || /[\r\n]/.test(token)) {
    throw new Error("Rithmic rate limiting is not configured.");
  }
  return { token, url: url.toString().replace(/\/$/, "") };
}

async function command(redis, body, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(redis.url, {
      body: JSON.stringify(body),
      headers: new Headers({
        Authorization: `Bearer ${redis.token}`,
        "Content-Type": "application/json",
      }),
      method: "POST",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("Rithmic rate limiting is unavailable.");
  }
  if (!response.ok) throw new Error("Rithmic rate limiting is unavailable.");
  try {
    return (await response.json()).result;
  } catch {
    throw new Error("Rithmic rate limiting is unavailable.");
  }
}

export async function acquireProviderSyncPermit({ provider, actorId, ipAddress, env = process.env, fetchImpl = fetch, lockId = randomUUID() }) {
  const cleanProvider = String(provider || "").toLowerCase();
  const cleanActor = String(actorId || "");
  const cleanIp = String(ipAddress || "");
  if (!ALLOWED_PROVIDERS.has(cleanProvider) || !cleanActor || !cleanIp) throw new Error("Sync rate limiting is not configured.");
  const redis = configuredRedis(env);
  const actorHash = createHash("sha256").update(cleanActor).digest("hex").slice(0, 32);
  const ipHash = createHash("sha256").update(cleanIp).digest("hex").slice(0, 32);
  const attemptsKey = `${cleanProvider}:sync:attempts:${actorHash}`;
  const ipAttemptsKey = `${cleanProvider}:sync:ip-attempts:${ipHash}`;
  const lockKey = `${cleanProvider}:sync:lock:${actorHash}`;
  const attempts = await command(redis, [
    "EVAL",
    "local out={}; for i=1,#KEYS do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],ARGV[1]) end; out[i]=n end; return out",
    "2",
    attemptsKey,
    ipAttemptsKey,
    String(ATTEMPT_WINDOW_SECONDS),
  ], fetchImpl);
  if (!Array.isArray(attempts) || attempts.length !== 2
    || attempts.some((value) => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) throw new Error("Rithmic rate limiting is unavailable.");
  if (attempts.some((value) => value > ATTEMPT_LIMIT)) {
    return { allowed: false, retryAfterSeconds: ATTEMPT_WINDOW_SECONDS, release: async () => undefined };
  }

  const locked = await command(redis, ["SET", lockKey, lockId, "NX", "EX", LOCK_SECONDS], fetchImpl);
  if (locked !== "OK") return { allowed: false, retryAfterSeconds: 10, release: async () => undefined };
  let released = false;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    async release() {
      if (released) return;
      released = true;
      await command(redis, [
        "EVAL",
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
        "1",
        lockKey,
        lockId,
      ], fetchImpl).catch(() => undefined);
    },
  };
}

export function acquireRithmicSyncPermit(options) {
  return acquireProviderSyncPermit({ ...options, provider: "rithmic" });
}

export function acquireTradovateSyncPermit(options) {
  return acquireProviderSyncPermit({ ...options, provider: "tradovate" });
}
