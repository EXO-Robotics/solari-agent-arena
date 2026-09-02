import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AdmissionError, __test, acquireCleanupLock, acquireCommandLock, anonymousHolder, assertAdmissionSweepHeartbeat,
  clientIpHash, recordAdmissionSweepHeartbeat, redeemAdmission, releaseCommandLock, remoteAdmissionConfigured,
  reserveAdmission, resetDailyUsage, resolvePairingCode, storePairingCode,
} from "./remote-admission.mjs";
import { ensureAdmissionSweep, scheduleAdmissionExpiry } from "./remote-expiry-scheduler.mjs";

const original = { ...process.env };

beforeEach(() => {
  process.env.SOLARI_REMOTE_TICKET_SECRET = "test-only-remote-ticket-secret-at-least-32-bytes";
  process.env.SOLARI_REMOTE_REDIS_SCOPE = "test";
  process.env.VERCEL = "1";
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});

function request(cookie, ip = "203.0.113.8") {
  return { headers: { ...(cookie ? { cookie } : {}), "x-forwarded-for": `${ip}, 10.0.0.1` }, socket: { remoteAddress: "127.0.0.1" } };
}

describe("remote public admission", () => {
  it("accepts the Vercel Marketplace Redis aliases without weakening the QStash requirement", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = "https://example.upstash.io";
    process.env.KV_REST_API_TOKEN = "test-token";
    process.env.QSTASH_TOKEN = "test-qstash-token";
    process.env.QSTASH_CURRENT_SIGNING_KEY = "test-current-signing-key";
    process.env.QSTASH_NEXT_SIGNING_KEY = "test-next-signing-key";
    expect(remoteAdmissionConfigured()).toBe(true);
    delete process.env.QSTASH_NEXT_SIGNING_KEY;
    expect(remoteAdmissionConfigured()).toBe(false);
  });

  it("issues and verifies a secure anonymous holder cookie without exposing the raw IP", () => {
    const first = anonymousHolder(request());
    expect(first.setCookie).toContain("__Host-saa_holder=");
    expect(first.setCookie).toContain("HttpOnly; Secure; SameSite=Lax");
    const cookie = first.setCookie.split(";")[0];
    const second = anonymousHolder(request(cookie));
    expect(second.id).toBe(first.id);
    expect(second.setCookie).toBeNull();
    expect(clientIpHash(request())).toMatch(/^[a-f0-9]{64}$/);
    expect(clientIpHash(request())).not.toContain("203.0.113.8");
  });

  it("rejects a tampered holder cookie and rotates the anonymous subject", () => {
    const first = anonymousHolder(request());
    const originalCookie = first.setCookie.split(";")[0];
    const cookie = `${originalCookie.slice(0, -1)}${originalCookie.endsWith("0") ? "1" : "0"}`;
    const second = anonymousHolder(request(cookie));
    expect(second.id).not.toBe(first.id);
    expect(second.setCookie).toContain("__Host-saa_holder=");
    expect(() => anonymousHolder(request("__Host-saa_holder=%E0%A4%A"))).not.toThrow();
  });

  it("maps the atomic reservation result to a bounded lease or a public quota error", async () => {
    const calls = [];
    const redis = { async eval(script, keys, args) { calls.push({ script, keys, args }); return [1, "0"]; } };
    const lease = await reserveAdmission({ holderHash: "a".repeat(64), ipHash: "b".repeat(64), leaseId: "11111111-1111-4111-8111-111111111111", nowMs: Date.UTC(2026, 8, 1), redis });
    expect(lease.leaseId).toBe("11111111-1111-4111-8111-111111111111");
    expect(calls[0].script).toContain("saa.reserve.v1");
    expect(calls[0].args).not.toContain("203.0.113.8");

    const denied = { async eval() { return [0, "global-daily"]; } };
    await expect(reserveAdmission({ holderHash: "a".repeat(64), ipHash: "b".repeat(64), redis: denied })).rejects.toMatchObject({ code: "global-daily", status: 429 });
  });

  it("fails closed when the atomic store is unavailable", async () => {
    const redis = { async eval() { throw new Error("offline"); } };
    await expect(reserveAdmission({ holderHash: "a".repeat(64), ipHash: "b".repeat(64), redis })).rejects.toBeInstanceOf(AdmissionError);
  });

  it("requires a recent signed-sweeper heartbeat before paid work can start", async () => {
    let heartbeat;
    const redis = {
      async set(_key, value) { heartbeat = value; return "OK"; },
      async get() { return heartbeat; },
    };
    await recordAdmissionSweepHeartbeat(redis, 1_000_000);
    await expect(assertAdmissionSweepHeartbeat(redis, 1_599_000)).resolves.toMatchObject({ heartbeatAt: 1_000_000, ageSeconds: 599 });
    await expect(assertAdmissionSweepHeartbeat(redis, 1_601_000)).rejects.toMatchObject({ code: "cleanup-stale" });
  });

  it("schedules the absolute cleanup before the unclaimed-ticket cleanup", async () => {
    const published = [];
    const client = { async publishJSON(value) { published.push(value); return { messageId: `msg_${published.length}` }; } };
    const nowMs = Date.UTC(2026, 8, 1);
    const result = await scheduleAdmissionExpiry({
      leaseId: "11111111-1111-4111-8111-111111111111",
      pairingExpiresAt: nowMs + 300_000,
      hardExpiresAt: nowMs + 1_200_000,
      arenaUrl: "https://arena.example/?agent=1",
    }, client, nowMs);
    expect(result.map((entry) => entry.phase)).toEqual(["hard", "pairing"]);
    expect(published.map((entry) => entry.delay)).toEqual([1200, 300]);
    expect(published[0].url).toBe("https://arena.example/api/arena-expire");
    expect(published[0].body).not.toHaveProperty("sessionId");
  });

  it("configures an idempotently named recurring backup sweeper", async () => {
    const calls = [];
    const client = { schedules: {
      async create(value) { calls.push(value); return { scheduleId: value.scheduleId }; },
      async get(scheduleId) { return { ...calls[0], scheduleId, isPaused: false }; },
    } };
    const result = await ensureAdmissionSweep("https://arena.example", client);
    expect(result.scheduleId).toBe("solari-agent-arena-sweep-v1");
    expect(calls[0]).toMatchObject({ cron: "*/5 * * * *", destination: "https://arena.example/api/arena-expire" });
    expect(JSON.parse(calls[0].body)).toEqual({ schemaVersion: "solari.arena.remote-expiry.v1", phase: "sweep" });
  });

  it("keeps all quota checks and the pending reservation in one Lua operation", () => {
    expect(__test.RESERVE_SCRIPT).toContain('redis.call("ZCARD", KEYS[2])');
    expect(__test.RESERVE_SCRIPT).toContain('redis.call("INCR", globalDailyKey)');
    expect(__test.RESERVE_SCRIPT).toContain('redis.call("HSET", KEYS[5]');
    expect(__test.CANCEL_PENDING_SCRIPT).toContain('redis.call("DECR", key)');
  });

  it("indexes pairing at five minutes and atomically extends a redeemed lease to its hard deadline", async () => {
    expect(__test.COMMIT_SCRIPT).toContain('redis.call("ZADD", KEYS[2], pairingExpiresAt, leaseId)');
    expect(__test.REDEEM_SCRIPT).toContain('redis.call("ZADD", KEYS[2], hardExpiresAt, ARGV[4])');
    const calls = [];
    const redis = { async eval(script, keys, args) { calls.push({ script, keys, args }); return 1; } };
    const leaseId = "11111111-1111-4111-8111-111111111111";
    await redeemAdmission({ leaseId, sessionId: "provider-session-123", ticketJtiHash: "ticket-jti-hash" }, redis, 1_000_000);
    expect(calls[0].keys).toHaveLength(3);
    expect(calls[0].args.slice(1, 4)).toEqual(["ticket-jti-hash", 1_000, leaseId]);
    expect(calls[0].args[4]).toBe("{saa-remote-v1}:test");
    expect(calls[0].args[5]).toBe("");
  });

  it("resolves and atomically consumes a short run code without storing the raw code in Redis", async () => {
    const values = new Map();
    const calls = [];
    const redis = {
      async set(key, value, options) { calls.push({ key, value, options }); values.set(key, value); return "OK"; },
      async get(key) { return values.get(key); },
      async eval(script, keys, args) {
        calls.push({ script, keys, args });
        if (values.get(keys[2]) !== args[5]) return 0;
        values.delete(keys[2]);
        return 1;
      },
    };
    const code = "run_ABCDEFGHIJKLMNOPQRSTUVWX";
    const ticket = `saa1.${"a".repeat(48)}`;
    await storePairingCode(code, ticket, 400_000, redis, 100_000);
    expect(calls[0].key).not.toContain(code);
    expect(calls[0].options).toEqual({ nx: true, ex: 300 });
    await expect(resolvePairingCode(code, redis)).resolves.toBe(ticket);
    await expect(redeemAdmission({
      leaseId: "11111111-1111-4111-8111-111111111111",
      sessionId: "provider-session-123",
      ticketJtiHash: "ticket-jti-hash",
      pairingCode: code,
      pairingTicket: ticket,
    }, redis, 200_000)).resolves.toBe(true);
    await expect(resolvePairingCode(code, redis)).rejects.toThrow("Invalid Arena capability");
    expect(__test.REDEEM_SCRIPT).toContain('if pairingTicket ~= "" then redis.call("DEL", KEYS[3]) end');
  });

  it("uses an owned distributed command lock and never blindly deletes a successor lock", async () => {
    const calls = [];
    const redis = {
      async set(key, token, options) { calls.push({ key, token, options }); return "OK"; },
      async eval(script, keys, args) { calls.push({ script, keys, args }); return 1; },
    };
    const lock = await acquireCommandLock("11111111-1111-4111-8111-111111111111", redis);
    await releaseCommandLock(lock, redis);
    expect(lock.token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(calls[0].options).toEqual({ nx: true, ex: 150 });
    expect(calls[1].script).toContain("saa.release-lock.v1");
    expect(calls[1].args).toEqual([lock.token]);
  });

  it("serializes commands and cleanup through the same lifecycle mutex", async () => {
    const keys = [];
    const redis = { async set(key) { keys.push(key); return "OK"; } };
    await acquireCommandLock("11111111-1111-4111-8111-111111111111", redis);
    await acquireCleanupLock("11111111-1111-4111-8111-111111111111", redis);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain("lifecycle-lock");
  });

  it("keeps command ownership beyond the 120-second function ceiling", async () => {
    const options = [];
    const redis = { async set(_key, _token, value) { options.push(value); return "OK"; } };
    await acquireCommandLock("11111111-1111-4111-8111-111111111111", redis);
    await acquireCleanupLock("11111111-1111-4111-8111-111111111111", redis);
    expect(options).toEqual([{ nx: true, ex: 150 }, { nx: true, ex: 30 }]);
  });

  it("resets daily usage by advancing an epoch without touching active leases", async () => {
    const calls = [];
    const redis = { async eval(script, keys, args) { calls.push({ script, keys, args }); return [6, 7]; } };
    const result = await resetDailyUsage(redis, "test");
    expect(result).toMatchObject({ reset: true, scope: "test", previousEpoch: 6, epoch: 7 });
    expect(calls[0].keys[0]).toContain("usage-epoch");
    expect(calls[0].keys.join(" ")).not.toContain(":active");
    await expect(resetDailyUsage(redis, "production")).rejects.toThrow("scope mismatch");
  });
});
