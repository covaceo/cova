import { createHash } from 'node:crypto';
import { uuid } from '../src/lib/workspaceValidation';

// Full-model Standard-tier bound, not a serialized-byte token estimate:
// (922000 / 1e6 * $0.125 cache-write * 2 + 120 / 1e6 * $0.5 * 1.5)
// * 1.10 regional premium = $0.253649; round UP to $0.26 per attempt.
// GPT-6 Luna model documentation: maximum input and long-context pricing.
// Assumes the caller remains pinned to default tier, <=120 output tokens,
// and no billable tools. Re-evaluate this bound if those constraints change.
export const ASK_COVA_RESERVATION_MICRO_USD = 260_000;
export const ASK_COVA_MAX_BUDGET_MICRO_USD = 10_000_000;
const PREFIX = 'ask-cova:{reservation-v1}:';
const unavailable = () => new Error('Ask Cova reservation unavailable.');

// One cluster hash slot. Budget and receipts NEVER expire. An operator must
// explicitly initialize the pinned ledger; requests never initialize or repair it.
// No settlement/refund: unknown outcomes stay fully charged.
export const ASK_COVA_RESERVE_LUA = `
local expected={'hash','string','hash','string','string'}
for i=1,#KEYS do
  local t=redis.call('TYPE',KEYS[i]).ok
  if t~='none' and t~=expected[i] then return {0,6} end
end
local campaign=redis.call('HGET',KEYS[1],'campaign')
local cap=tonumber(ARGV[2])
local charge=tonumber(ARGV[3])
local rawUsed=redis.call('HGET',KEYS[1],'used')
if not campaign or campaign~=ARGV[1] or redis.call('HGET',KEYS[1],'cap')~=ARGV[2] or redis.call('PTTL',KEYS[1])~=-1 then return {0,6} end
if not rawUsed or (rawUsed~='0' and not string.match(rawUsed,'^[1-9][0-9]*$')) then return {0,6} end
local used=tonumber(rawUsed)
if not used or used<0 or used%1~=0 or used>cap then return {0,6} end
local clock=redis.call('TIME')
local day=tostring(math.floor(tonumber(clock[1])/86400))
local count=0
if redis.call('HGET',KEYS[3],'day')==day then count=tonumber(redis.call('HGET',KEYS[3],'count') or '0') end
local attempts=tonumber(redis.call('GET',KEYS[2]) or '0')
if not count or count<0 or count%1~=0 or not attempts or attempts<0 or attempts%1~=0 then return {0,6} end
attempts=redis.call('INCR',KEYS[2])
if attempts==1 then redis.call('EXPIRE',KEYS[2],60) end
if attempts>5 then return {0,1} end
if redis.call('EXISTS',KEYS[4])==1 then return {0,2} end
if redis.call('EXISTS',KEYS[5])==1 then return {0,3} end
if count>=20 then return {0,4} end
if used+charge>cap then return {0,5} end
redis.call('HSET',KEYS[1],'used',used+charge)
redis.call('HSET',KEYS[3],'day',day,'count',count+1)
redis.call('EXPIRE',KEYS[3],172800)
redis.call('SET',KEYS[4],'reserved')
redis.call('SET',KEYS[5],ARGV[4],'EX',300)
return {1,0}
`;
const RELEASE_LUA = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";

export function askCovaBudgetConfiguration(env: Record<string, string | undefined>) {
  const campaign = env.ASK_COVA_BUDGET_ID || '';
  const rawCap = env.ASK_COVA_BUDGET_MICRO_USD || '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(campaign) || !/^[1-9]\d{0,7}$/.test(rawCap)) throw unavailable();
  const cap = Number(rawCap);
  if (cap < ASK_COVA_RESERVATION_MICRO_USD || cap > ASK_COVA_MAX_BUDGET_MICRO_USD) throw unavailable();
  const rawUrl = env.KV_REST_API_URL || '';
  if (!/^https:\/\/[a-z0-9-]+\.upstash\.io\/?$/.test(rawUrl)) throw unavailable();
  const token = env.KV_REST_API_TOKEN || '';
  if (token.length < 32 || token.length > 4096 || /\s/.test(token)) throw unavailable();
  return { campaign, cap, url: rawUrl.replace(/\/$/, ''), token };
}
// Financial receipts must not silently overwrite contradictory properties.
// Keep this boundary local: provider/request decoding has a separate contract.
function receiptJson(bytes: Uint8Array): any {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const parsed = JSON.parse(text);
  const tokens = text.match(/"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || [];
  let cursor = 0;
  const value = (depth: number) => {
    if (depth > 32) throw unavailable();
    const token = tokens[cursor++];
    if (token === '{') {
      const seen = new Set<string>();
      while (tokens[cursor] !== '}') {
        const key = JSON.parse(tokens[cursor++]);
        if (seen.has(key)) throw unavailable();
        seen.add(key); cursor++; value(depth + 1);
        if (tokens[cursor] === ',') cursor++; else break;
      }
      cursor++;
    } else if (token === '[') {
      while (tokens[cursor] !== ']') { value(depth + 1); if (tokens[cursor] === ',') cursor++; else break; }
      cursor++;
    }
  };
  value(0);
  return parsed;
}
async function command(config: ReturnType<typeof askCovaBudgetConfiguration>, body: any[], fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(config.url, {
      method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      throw unavailable();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 4096) throw unavailable();
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => undefined); }
    const parsed = receiptJson(Buffer.concat(chunks));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, 'result')) throw unavailable();
    return parsed.result;
  } catch { throw unavailable(); }
}
export async function acquireAskCovaPermit({ ownerId, requestId, env = process.env, fetchImpl = fetch }: any) {
  if (!uuid(ownerId) || !uuid(requestId)) throw unavailable();
  const config = askCovaBudgetConfiguration(env);
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  const actor = hash(ownerId.toLowerCase());
  const identity = hash(ownerId.toLowerCase() + ':' + requestId.toLowerCase());
  const lock = PREFIX + 'lock:' + actor;
  const keys = [PREFIX + 'budget', PREFIX + 'attempts:' + actor, PREFIX + 'day:' + actor, PREFIX + 'request:' + identity, lock];
  const result = await command(config, ['EVAL', ASK_COVA_RESERVE_LUA, '5', ...keys,
    config.campaign, String(config.cap), String(ASK_COVA_RESERVATION_MICRO_USD), identity], fetchImpl);
  if (!Array.isArray(result) || result.length !== 2 ||
      !(result[0] === 1 && result[1] === 0 || result[0] === 0 && Number.isInteger(result[1]) && result[1] >= 1 && result[1] <= 6)) throw unavailable();
  let released = false;
  return {
    allowed: result[0] === 1,
    reason: result[1],
    async release() {
      if (released || result[0] !== 1) return;
      released = true;
      await command(config, ['EVAL', RELEASE_LUA, '1', lock, identity], fetchImpl).catch(() => undefined);
    },
  };
}
