import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";

const COOKIE_NAME = "__Host-saa_holder";
const KEY_TAG = "{saa-remote-v1}";
const PENDING_LEASE_SECONDS = 2 * 60;
const UNCERTAIN_PROVIDER_SECONDS = 2 * 60 * 60;
const RECORD_TTL_SECONDS = 2 * 24 * 60 * 60;
const SWEEP_HEARTBEAT_MAX_AGE_SECONDS = 10 * 60;

const RESERVE_SCRIPT = `-- saa.reserve.v1
local epoch = redis.call("GET", KEYS[1]) or "0"
local prefix = ARGV[1]
local day = ARGV[2]
local holderHash = ARGV[3]
local ipHash = ARGV[4]
local leaseId = ARGV[5]
local now = tonumber(ARGV[6])
local pendingUntil = tonumber(ARGV[7])
local maxConcurrent = tonumber(ARGV[8])
local maxIpConcurrent = tonumber(ARGV[9])
local maxDaily = tonumber(ARGV[10])
local maxHolderDaily = tonumber(ARGV[11])
local maxIpDaily = tonumber(ARGV[12])
local ttl = tonumber(ARGV[13])

local globalDailyKey = prefix .. ":day:" .. epoch .. ":" .. day .. ":global"
local holderDailyKey = prefix .. ":day:" .. epoch .. ":" .. day .. ":holder:" .. holderHash
local ipDailyKey = prefix .. ":day:" .. epoch .. ":" .. day .. ":ip:" .. ipHash
local ipActiveKey = prefix .. ":active:ip:" .. ipHash

if redis.call("EXISTS", KEYS[4]) == 1 then return {0, "holder-active"} end
if redis.call("ZCARD", KEYS[2]) >= maxConcurrent then return {0, "global-concurrency"} end
if redis.call("ZCARD", ipActiveKey) >= maxIpConcurrent then return {0, "ip-concurrency"} end
if tonumber(redis.call("GET", globalDailyKey) or "0") >= maxDaily then return {0, "global-daily"} end
if tonumber(redis.call("GET", holderDailyKey) or "0") >= maxHolderDaily then return {0, "holder-daily"} end
if tonumber(redis.call("GET", ipDailyKey) or "0") >= maxIpDaily then return {0, "ip-daily"} end

redis.call("INCR", globalDailyKey)
redis.call("INCR", holderDailyKey)
redis.call("INCR", ipDailyKey)
redis.call("EXPIRE", globalDailyKey, ttl)
redis.call("EXPIRE", holderDailyKey, ttl)
redis.call("EXPIRE", ipDailyKey, ttl)
redis.call("HSET", KEYS[5],
  "state", "pending", "holderHash", holderHash, "ipHash", ipHash,
  "day", day, "epoch", epoch, "createdAt", now, "pendingUntil", pendingUntil)
redis.call("EXPIRE", KEYS[5], ttl)
redis.call("ZADD", KEYS[2], pendingUntil, leaseId)
redis.call("ZADD", ipActiveKey, pendingUntil, leaseId)
redis.call("SET", KEYS[3], ipHash, "EX", ttl)
redis.call("SET", KEYS[4], leaseId, "EX", ttl, "NX")
return {1, epoch}
`;

const COMMIT_SCRIPT = `-- saa.commit.v1
if redis.call("HGET", KEYS[1], "state") ~= "creating" then return 0 end
local leaseId = ARGV[1]
local sessionId = ARGV[2]
local sessionIdHash = ARGV[3]
local pairingExpiresAt = tonumber(ARGV[4])
local hardExpiresAt = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
if not ipHash then return 0 end
redis.call("HSET", KEYS[1],
  "state", "pairing", "sessionId", sessionId, "sessionIdHash", sessionIdHash,
  "pairingExpiresAt", pairingExpiresAt, "hardExpiresAt", hardExpiresAt)
redis.call("EXPIRE", KEYS[1], ttl)
redis.call("ZADD", KEYS[2], pairingExpiresAt, leaseId)
redis.call("ZADD", ARGV[7] .. ":active:ip:" .. ipHash, pairingExpiresAt, leaseId)
redis.call("SET", KEYS[3], leaseId, "EX", ttl)
redis.call("EXPIRE", KEYS[4], ttl)
return 1
`;

const MARK_CREATING_SCRIPT = `-- saa.mark-creating.v1
if redis.call("HGET", KEYS[1], "state") ~= "pending" then return 0 end
local leaseId = ARGV[1]
local uncertainUntil = tonumber(ARGV[2])
local prefix = ARGV[3]
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
if not ipHash then return 0 end
redis.call("HSET", KEYS[1], "state", "creating", "uncertainUntil", uncertainUntil, "hardExpiresAt", uncertainUntil)
redis.call("ZADD", KEYS[2], uncertainUntil, leaseId)
redis.call("ZADD", prefix .. ":active:ip:" .. ipHash, uncertainUntil, leaseId)
return 1
`;

const BIND_ORPHAN_SCRIPT = `-- saa.bind-orphan.v1
local state = redis.call("HGET", KEYS[1], "state")
if state ~= "creating" and state ~= "pairing" then return 0 end
local existing = redis.call("HGET", KEYS[1], "sessionIdHash")
if existing and existing ~= ARGV[3] then return 0 end
local leaseId = ARGV[1]
local hardExpiresAt = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
if not ipHash then return 0 end
redis.call("HSET", KEYS[1], "state", "orphan", "sessionId", ARGV[2], "sessionIdHash", ARGV[3], "hardExpiresAt", hardExpiresAt)
redis.call("EXPIRE", KEYS[1], ttl)
redis.call("ZADD", KEYS[2], hardExpiresAt, leaseId)
redis.call("ZADD", ARGV[6] .. ":active:ip:" .. ipHash, hardExpiresAt, leaseId)
redis.call("SET", KEYS[3], leaseId, "EX", ttl)
return 1
`;

const CANCEL_PENDING_SCRIPT = `-- saa.cancel-pending.v1
if redis.call("HGET", KEYS[1], "state") ~= "pending" then return 0 end
local prefix = ARGV[1]
local leaseId = ARGV[2]
local holderHash = redis.call("HGET", KEYS[1], "holderHash")
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
local day = redis.call("HGET", KEYS[1], "day")
local epoch = redis.call("HGET", KEYS[1], "epoch")
if not holderHash or not ipHash or not day or not epoch then return 0 end
local counters = {
  prefix .. ":day:" .. epoch .. ":" .. day .. ":global",
  prefix .. ":day:" .. epoch .. ":" .. day .. ":holder:" .. holderHash,
  prefix .. ":day:" .. epoch .. ":" .. day .. ":ip:" .. ipHash
}
for _, key in ipairs(counters) do
  local value = tonumber(redis.call("GET", key) or "0")
  if value <= 1 then redis.call("DEL", key) else redis.call("DECR", key) end
end
if redis.call("GET", KEYS[3]) == leaseId then redis.call("DEL", KEYS[3]) end
redis.call("ZREM", KEYS[2], leaseId)
redis.call("ZREM", prefix .. ":active:ip:" .. ipHash, leaseId)
redis.call("DEL", KEYS[4])
redis.call("DEL", KEYS[1])
return 1
`;

const REDEEM_SCRIPT = `-- saa.redeem.v1
if redis.call("HGET", KEYS[1], "state") ~= "pairing" then return 0 end
if redis.call("HGET", KEYS[1], "sessionIdHash") ~= ARGV[1] then return 0 end
if redis.call("HEXISTS", KEYS[1], "ticketJtiHash") == 1 then return 0 end
local hardExpiresAt = tonumber(redis.call("HGET", KEYS[1], "hardExpiresAt"))
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
if not hardExpiresAt or not ipHash then return 0 end
redis.call("HSET", KEYS[1], "state", "active", "ticketJtiHash", ARGV[2], "redeemedAt", ARGV[3])
redis.call("ZADD", KEYS[2], hardExpiresAt, ARGV[4])
redis.call("ZADD", ARGV[5] .. ":active:ip:" .. ipHash, hardExpiresAt, ARGV[4])
return 1
`;

const CLOSE_SCRIPT = `-- saa.close.v1
local state = redis.call("HGET", KEYS[1], "state")
if not state or state == "closed" then return 0 end
if redis.call("HGET", KEYS[1], "sessionIdHash") ~= ARGV[1] then return 0 end
local leaseId = ARGV[2]
local holderHash = redis.call("HGET", KEYS[1], "holderHash")
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
if redis.call("GET", KEYS[4]) == leaseId then redis.call("DEL", KEYS[4]) end
redis.call("ZREM", KEYS[2], leaseId)
if ipHash then redis.call("ZREM", ARGV[3] .. ":active:ip:" .. ipHash, leaseId) end
redis.call("DEL", KEYS[3])
redis.call("DEL", KEYS[5])
redis.call("HSET", KEYS[1], "state", "closed", "closedAt", ARGV[4])
redis.call("HDEL", KEYS[1], "sessionId")
redis.call("EXPIRE", KEYS[1], 3600)
return 1
`;

const ABANDON_SCRIPT = `-- saa.abandon.v1
local state = redis.call("HGET", KEYS[1], "state")
if not state or state == "closed" then return 0 end
local leaseId = ARGV[1]
local prefix = ARGV[2]
local holderHash = redis.call("HGET", KEYS[1], "holderHash")
local ipHash = redis.call("HGET", KEYS[1], "ipHash")
local sessionIdHash = redis.call("HGET", KEYS[1], "sessionIdHash")
if holderHash and redis.call("GET", prefix .. ":active:holder:" .. holderHash) == leaseId then
  redis.call("DEL", prefix .. ":active:holder:" .. holderHash)
end
redis.call("ZREM", KEYS[2], leaseId)
if ipHash then redis.call("ZREM", prefix .. ":active:ip:" .. ipHash, leaseId) end
if sessionIdHash then redis.call("DEL", prefix .. ":session:" .. sessionIdHash) end
redis.call("DEL", KEYS[3])
redis.call("HSET", KEYS[1], "state", "closed", "closeReason", ARGV[3], "closedAt", ARGV[4])
redis.call("HDEL", KEYS[1], "sessionId")
redis.call("EXPIRE", KEYS[1], 3600)
return 1
`;

const DUE_SCRIPT = `-- saa.due.v1
return redis.call("ZRANGEBYSCORE", KEYS[1], "-inf", ARGV[1], "LIMIT", "0", ARGV[2])
`;

const DEFER_OR_PRUNE_SCRIPT = `-- saa.defer-or-prune.v1
local leaseId = ARGV[1]
local prefix = ARGV[2]
local now = tonumber(ARGV[3])
if redis.call("EXISTS", KEYS[3]) == 0 then
  local mappedIpHash = redis.call("GET", KEYS[2])
  redis.call("ZREM", KEYS[1], leaseId)
  if mappedIpHash then redis.call("ZREM", prefix .. ":active:ip:" .. mappedIpHash, leaseId) end
  redis.call("DEL", KEYS[2])
  return {"pruned", 0, 0}
end
local ipHash = redis.call("HGET", KEYS[3], "ipHash")
if not ipHash then return {"incomplete", 0, 0} end
local failures = redis.call("HINCRBY", KEYS[3], "cleanupFailures", 1)
local exponent = math.min(failures - 1, 4)
local delay = math.min(300, 15 * (2 ^ exponent))
local retryAt = now + delay
redis.call("HSET", KEYS[3], "lastCleanupFailureAt", now, "nextCleanupAttemptAt", retryAt)
redis.call("ZADD", KEYS[1], retryAt, leaseId)
redis.call("ZADD", prefix .. ":active:ip:" .. ipHash, retryAt, leaseId)
redis.call("EXPIRE", KEYS[2], ${RECORD_TTL_SECONDS})
return {"deferred", retryAt, failures}
`;

const RESET_SCRIPT = `-- saa.reset-usage.v1
local previous = tonumber(redis.call("GET", KEYS[1]) or "0")
local current = redis.call("INCR", KEYS[1])
redis.call("HSET", KEYS[2], "previousEpoch", previous, "currentEpoch", current, "resetAt", ARGV[1])
redis.call("EXPIRE", KEYS[2], 7776000)
return {previous, current}
`;

const RELEASE_LOCK_SCRIPT = `-- saa.release-lock.v1
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;

const CONSUME_PAIRING_CODE_SCRIPT = `-- saa.consume-pairing-code.v1
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call("DEL", KEYS[1])
`;

let redisClient;

function redisCredentials() {
  return Object.freeze({
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  });
}

function envInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${name} configuration.`);
  return value;
}

function redisFromEnv() {
  const { url, token } = redisCredentials();
  if (!url || !token) throw new Error("Hosted Agent Practice admission is not configured.");
  redisClient ??= new Redis({ url, token });
  return redisClient;
}

function prefix() {
  const scope = process.env.SOLARI_REMOTE_REDIS_SCOPE ?? "production";
  if (!/^[a-z0-9-]{1,32}$/i.test(scope)) throw new Error("Invalid SOLARI_REMOTE_REDIS_SCOPE configuration.");
  return `${KEY_TAG}:${scope}`;
}

function secret() {
  const value = process.env.SOLARI_REMOTE_TICKET_SECRET;
  if (typeof value !== "string" || value.length < 32) throw new Error("Hosted Agent Practice is not configured.");
  return value;
}

function hmac(label, value) {
  return createHmac("sha256", secret()).update(`${label}:${value}`).digest("hex");
}

function pairingCodeKey(code) {
  if (!/^run_[A-Za-z0-9_-]{24}$/.test(code)) throw new Error("Invalid Arena capability.");
  return `${prefix()}:pairing-code:${hmac("pairing-code", code)}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function header(request, name) {
  const value = request?.headers?.get?.(name) ?? request?.headers?.[name] ?? request?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function parseCookies(request) {
  const raw = String(header(request, "cookie") ?? "");
  return Object.fromEntries(raw.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const split = part.indexOf("=");
    if (split === -1) return [part, ""];
    try { return [part.slice(0, split), decodeURIComponent(part.slice(split + 1))]; }
    catch { return [part.slice(0, split), ""]; }
  }));
}

export function remoteAdmissionConfigured() {
  const { url, token } = redisCredentials();
  return Boolean(url && token && process.env.QSTASH_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);
}

export function admissionLimits() {
  return Object.freeze({
    maxConcurrent: envInteger("SOLARI_REMOTE_MAX_CONCURRENT", 2, 1, 100),
    maxIpConcurrent: envInteger("SOLARI_REMOTE_MAX_IP_CONCURRENT", 1, 1, 20),
    maxDaily: envInteger("SOLARI_REMOTE_DAILY_LIMIT", 20, 1, 100_000),
    maxHolderDaily: envInteger("SOLARI_REMOTE_HOLDER_DAILY_LIMIT", 2, 1, 1_000),
    maxIpDaily: envInteger("SOLARI_REMOTE_IP_DAILY_LIMIT", 2, 1, 10_000),
  });
}

export function anonymousHolder(request) {
  const current = parseCookies(request)[COOKIE_NAME];
  if (current) {
    const [id, signature, extra] = current.split(".");
    if (!extra && /^[0-9a-f-]{36}$/i.test(id) && /^[a-f0-9]{64}$/.test(signature) && safeEqual(signature, hmac("holder", id))) {
      return Object.freeze({ id, hash: hmac("holder-hash", id), setCookie: null });
    }
  }
  const id = randomUUID();
  const value = `${id}.${hmac("holder", id)}`;
  return Object.freeze({
    id,
    hash: hmac("holder-hash", id),
    setCookie: `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
  });
}

export function clientIpHash(request) {
  const forwarded = process.env.VERCEL === "1" ? String(header(request, "x-forwarded-for") ?? "").split(",")[0].trim() : "";
  const direct = request?.socket?.remoteAddress ?? request?.connection?.remoteAddress ?? "unknown";
  return hmac("ip-hash", forwarded || direct);
}

function keys(leaseId, holderHash, sessionIdHash) {
  const base = prefix();
  return {
    base,
    epoch: `${base}:usage-epoch`,
    active: `${base}:active`,
    lease: `${base}:lease:${leaseId}`,
    holderActive: `${base}:active:holder:${holderHash}`,
    leaseIp: `${base}:lease-ip:${leaseId}`,
    session: sessionIdHash ? `${base}:session:${sessionIdHash}` : null,
  };
}

export class AdmissionError extends Error {
  constructor(code, message, status = 503, retryAfterSeconds = 60) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function reserveAdmission({ holderHash, ipHash, redis = redisFromEnv(), nowMs = Date.now(), leaseId = randomUUID() }) {
  const limits = admissionLimits();
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const pendingUntil = Math.floor(nowMs / 1_000) + PENDING_LEASE_SECONDS;
  const k = keys(leaseId, holderHash);
  let result;
  try {
    result = await redis.eval(RESERVE_SCRIPT, [k.epoch, k.active, k.leaseIp, k.holderActive, k.lease], [
      k.base, day, holderHash, ipHash, leaseId, Math.floor(nowMs / 1_000), pendingUntil,
      limits.maxConcurrent, limits.maxIpConcurrent, limits.maxDaily, limits.maxHolderDaily, limits.maxIpDaily, RECORD_TTL_SECONDS,
    ]);
  } catch {
    throw new AdmissionError("store-unavailable", "Hosted practice admission is temporarily unavailable.");
  }
  if (Number(result?.[0]) === 1) return Object.freeze({ leaseId, holderHash, ipHash, reservedAt: nowMs, pendingUntil });
  const code = String(result?.[1] ?? "store-unavailable");
  const daily = code.endsWith("daily");
  throw new AdmissionError(code, daily ? "This practice allowance has been used for today." : "All hosted practice slots are currently busy.", 429, daily ? 3600 : 60);
}

export async function commitAdmission(admission, sessionId, { pairingExpiresAt, hardExpiresAt }, redis = redisFromEnv()) {
  const sessionIdHash = hmac("session-hash", sessionId);
  const k = keys(admission.leaseId, admission.holderHash, sessionIdHash);
  const ttl = Math.max(60, Math.ceil((hardExpiresAt - Date.now()) / 1_000) + 3600);
  let committed;
  try {
    committed = await redis.eval(COMMIT_SCRIPT, [k.lease, k.active, k.session, k.holderActive], [
      admission.leaseId, sessionId, sessionIdHash, Math.floor(pairingExpiresAt / 1_000), Math.floor(hardExpiresAt / 1_000), ttl, k.base,
    ]);
  } catch {
    const lease = await redis.hgetall(k.lease).catch(() => null);
    if (lease?.state === "pairing" && lease.sessionIdHash === sessionIdHash) committed = 1;
    else throw new AdmissionError("commit-failed", "Hosted practice admission could not be committed.");
  }
  if (Number(committed) !== 1) throw new AdmissionError("commit-failed", "Hosted practice admission could not be committed.");
  return Object.freeze({ ...admission, sessionIdHash, pairingExpiresAt, hardExpiresAt });
}

export async function markAdmissionCreating(admission, redis = redisFromEnv(), nowMs = Date.now()) {
  const k = keys(admission.leaseId, admission.holderHash);
  const uncertainUntil = Math.floor(nowMs / 1_000) + UNCERTAIN_PROVIDER_SECONDS;
  const marked = await redis.eval(MARK_CREATING_SCRIPT, [k.lease, k.active], [admission.leaseId, uncertainUntil, k.base]);
  if (Number(marked) !== 1) throw new AdmissionError("create-mark-failed", "Hosted practice admission could not start safely.");
  return Object.freeze({ ...admission, uncertainUntil });
}

export async function bindOrphanAdmission(admission, sessionId, hardExpiresAt, redis = redisFromEnv()) {
  const sessionIdHash = hmac("session-hash", sessionId);
  const k = keys(admission.leaseId, admission.holderHash, sessionIdHash);
  const ttl = Math.max(60, Math.ceil((hardExpiresAt - Date.now()) / 1_000) + 3600);
  const bound = await redis.eval(BIND_ORPHAN_SCRIPT, [k.lease, k.active, k.session], [admission.leaseId, sessionId, sessionIdHash, Math.floor(hardExpiresAt / 1_000), ttl, k.base]);
  return Number(bound) === 1;
}

export async function cancelPendingAdmission(admission, redis = redisFromEnv()) {
  const k = keys(admission.leaseId, admission.holderHash);
  return Number(await redis.eval(CANCEL_PENDING_SCRIPT, [k.lease, k.active, k.holderActive, k.leaseIp], [k.base, admission.leaseId])) === 1;
}

export async function redeemAdmission(leaseId, sessionId, ticketJtiHash, redis = redisFromEnv(), nowMs = Date.now()) {
  const sessionIdHash = hmac("session-hash", sessionId);
  const k = keys(leaseId, "unused", sessionIdHash);
  const redeemed = await redis.eval(REDEEM_SCRIPT, [k.lease, k.active], [sessionIdHash, ticketJtiHash, Math.floor(nowMs / 1_000), leaseId, k.base]);
  if (Number(redeemed) !== 1) throw new Error("Arena pairing ticket was already redeemed or revoked.");
  return true;
}

export async function storePairingCode(code, pairingTicket, expiresAt, redis = redisFromEnv(), nowMs = Date.now()) {
  if (typeof pairingTicket !== "string" || !pairingTicket.startsWith("saa1.")) throw new Error("Invalid Arena capability.");
  const ttl = Math.max(1, Math.ceil((expiresAt - nowMs) / 1_000));
  const stored = await redis.set(pairingCodeKey(code), pairingTicket, { nx: true, ex: ttl });
  if (stored !== "OK") throw new Error("Hosted Agent Practice admission is not configured.");
  return true;
}

export async function resolvePairingCode(code, redis = redisFromEnv()) {
  const pairingTicket = await redis.get(pairingCodeKey(code));
  if (typeof pairingTicket !== "string" || !pairingTicket.startsWith("saa1.")) throw new Error("Invalid Arena capability.");
  return pairingTicket;
}

export async function consumePairingCode(code, pairingTicket, redis = redisFromEnv()) {
  return Number(await redis.eval(CONSUME_PAIRING_CODE_SCRIPT, [pairingCodeKey(code)], [pairingTicket])) === 1;
}

export async function requireActiveAdmission(leaseId, sessionId, redis = redisFromEnv(), nowMs = Date.now()) {
  const sessionIdHash = hmac("session-hash", sessionId);
  const lease = await redis.hgetall(keys(leaseId, "unused").lease);
  if (!lease || lease.state !== "active" || lease.sessionIdHash !== sessionIdHash || Number(lease.hardExpiresAt) <= Math.floor(nowMs / 1_000)) throw new Error("Arena session was released or expired.");
  return lease;
}

export async function getAdmissionLease(leaseId, redis = redisFromEnv()) {
  return await redis.hgetall(keys(leaseId, "unused").lease);
}

async function acquireLeaseLock(kind, leaseId, seconds, redis = redisFromEnv()) {
  const lockKey = `${prefix()}:${kind}-lock:${leaseId}`;
  const token = randomUUID();
  return (await redis.set(lockKey, token, { nx: true, ex: seconds })) === "OK" ? { lockKey, token } : null;
}

async function releaseLeaseLock(lock, redis = redisFromEnv()) {
  if (lock) await redis.eval(RELEASE_LOCK_SCRIPT, [lock.lockKey], [lock.token]);
}

export async function acquireCleanupLock(leaseId, redis = redisFromEnv()) {
  return await acquireLeaseLock("lifecycle", leaseId, 30, redis);
}

export async function releaseCleanupLock(lock, redis = redisFromEnv()) {
  await releaseLeaseLock(lock, redis);
}

export async function acquireCommandLock(leaseId, redis = redisFromEnv()) {
  const lock = await acquireLeaseLock("lifecycle", leaseId, 30, redis);
  if (!lock) throw new Error("Arena command already in progress.");
  return lock;
}

export async function releaseCommandLock(lock, redis = redisFromEnv()) {
  await releaseLeaseLock(lock, redis);
}

export async function closeAdmissionLease(leaseId, sessionId, redis = redisFromEnv(), nowMs = Date.now()) {
  const sessionIdHash = hmac("session-hash", sessionId);
  const lease = await redis.hgetall(keys(leaseId, "unused").lease);
  if (!lease) return false;
  const k = keys(leaseId, lease.holderHash, sessionIdHash);
  return Number(await redis.eval(CLOSE_SCRIPT, [k.lease, k.active, k.session, k.holderActive, k.leaseIp], [sessionIdHash, leaseId, k.base, Math.floor(nowMs / 1_000)])) === 1;
}

export async function abandonAdmissionLease(leaseId, reason, redis = redisFromEnv(), nowMs = Date.now()) {
  const k = keys(leaseId, "unused");
  return Number(await redis.eval(ABANDON_SCRIPT, [k.lease, k.active, k.leaseIp], [leaseId, k.base, reason, Math.floor(nowMs / 1_000)])) === 1;
}

export async function listDueLeaseIds(redis = redisFromEnv(), nowMs = Date.now(), limit = 10) {
  const base = prefix();
  return await redis.eval(DUE_SCRIPT, [`${base}:active`], [Math.floor(nowMs / 1_000), limit]);
}

export async function recordAdmissionSweepHeartbeat(redis = redisFromEnv(), nowMs = Date.now()) {
  const heartbeatAt = Math.floor(nowMs);
  await redis.set(`${prefix()}:sweep-heartbeat`, heartbeatAt, { ex: SWEEP_HEARTBEAT_MAX_AGE_SECONDS * 2 });
  return heartbeatAt;
}

export async function readAdmissionSweepHeartbeat(redis = redisFromEnv()) {
  const value = Number(await redis.get(`${prefix()}:sweep-heartbeat`));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function assertAdmissionSweepHeartbeat(redis = redisFromEnv(), nowMs = Date.now()) {
  let heartbeatAt;
  try { heartbeatAt = await readAdmissionSweepHeartbeat(redis); }
  catch { throw new AdmissionError("cleanup-unavailable", "Hosted practice cleanup is temporarily unavailable."); }
  const ageMs = Math.floor(nowMs) - heartbeatAt;
  if (heartbeatAt <= 0 || ageMs < 0 || ageMs > SWEEP_HEARTBEAT_MAX_AGE_SECONDS * 1_000) {
    throw new AdmissionError("cleanup-stale", "Hosted practice cleanup is temporarily unavailable.");
  }
  return Object.freeze({ heartbeatAt, ageSeconds: Math.floor(ageMs / 1_000) });
}

export async function deferOrPruneFailedLease(leaseId, redis = redisFromEnv(), nowMs = Date.now()) {
  const k = keys(leaseId, "unused");
  const result = await redis.eval(DEFER_OR_PRUNE_SCRIPT, [k.active, k.leaseIp, k.lease], [leaseId, k.base, Math.floor(nowMs / 1_000)]);
  const disposition = String(result?.[0] ?? "incomplete");
  return Object.freeze({
    disposition,
    retryAt: Number(result?.[1] ?? 0),
    failures: Number(result?.[2] ?? 0),
  });
}

export async function resetDailyUsage(redis = redisFromEnv(), expectedScope) {
  const configuredScope = process.env.SOLARI_REMOTE_REDIS_SCOPE ?? "production";
  if (expectedScope !== configuredScope) throw new Error(`Reset scope mismatch: expected ${configuredScope}.`);
  const resetAt = new Date().toISOString();
  const base = prefix();
  const result = await redis.eval(RESET_SCRIPT, [`${base}:usage-epoch`, `${base}:reset-audit`], [resetAt]);
  return { schemaVersion: "solari.arena.remote-usage-reset.v1", reset: true, scope: configuredScope, previousEpoch: Number(result[0]), epoch: Number(result[1]), resetAt };
}

export async function remoteUsageStatus(redis = redisFromEnv(), nowMs = Date.now()) {
  const base = prefix();
  const epoch = String(await redis.get(`${base}:usage-epoch`) ?? "0");
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const [daily, active] = await Promise.all([redis.get(`${base}:day:${epoch}:${day}:global`), redis.zcard(`${base}:active`)]);
  return { schemaVersion: "solari.arena.remote-usage-status.v1", day, epoch: Number(epoch), dailySessions: Number(daily ?? 0), activeLeases: Number(active ?? 0), limits: admissionLimits() };
}

export const __test = Object.freeze({
  COOKIE_NAME, RESERVE_SCRIPT, MARK_CREATING_SCRIPT, COMMIT_SCRIPT, BIND_ORPHAN_SCRIPT, CANCEL_PENDING_SCRIPT,
  REDEEM_SCRIPT, CLOSE_SCRIPT, ABANDON_SCRIPT, DUE_SCRIPT, RESET_SCRIPT, RELEASE_LOCK_SCRIPT,
  DEFER_OR_PRUNE_SCRIPT, CONSUME_PAIRING_CODE_SCRIPT, SWEEP_HEARTBEAT_MAX_AGE_SECONDS,
});
