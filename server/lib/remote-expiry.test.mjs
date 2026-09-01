import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expirePracticeLease, reapDuePracticeLeases } from "./remote-expiry.mjs";

const originalSecret = process.env.SOLARI_REMOTE_TICKET_SECRET;

beforeEach(() => { process.env.SOLARI_REMOTE_TICKET_SECRET = "test-only-remote-ticket-secret-at-least-32-bytes"; });
afterEach(() => {
  if (originalSecret === undefined) delete process.env.SOLARI_REMOTE_TICKET_SECRET;
  else process.env.SOLARI_REMOTE_TICKET_SECRET = originalSecret;
});

function fakeRedis(lease) {
  let current = lease;
  return {
    async hgetall() { return current; },
    async set() { return "OK"; },
    async del() { return 1; },
    async eval(script) {
      if (script.includes("saa.close.v1")) { current = { ...current, state: "closed" }; return 1; }
      if (script.includes("saa.cancel-pending.v1")) { current = null; return 1; }
      if (script.includes("saa.abandon.v1")) { current = { ...current, state: "closed" }; return 1; }
      if (script.includes("saa.release-lock.v1")) return 1;
      throw new Error("unexpected script");
    },
  };
}

describe("remote lease cleanup", () => {
  it("cancels a stale pending reservation without calling Solari", async () => {
    const redis = fakeRedis({ state: "pending", holderHash: "a".repeat(64), ipHash: "b".repeat(64), pendingUntil: 100 });
    const result = await expirePracticeLease("11111111-1111-4111-8111-111111111111", "hard", { nowMs: 100_000, redis, release: async () => { throw new Error("must not run"); } });
    expect(result).toEqual({ released: true, reason: "pending-cancelled" });
  });

  it("holds an uncertain provider attempt until its conservative window elapses", async () => {
    const redis = fakeRedis({ state: "creating", holderHash: "a".repeat(64), ipHash: "b".repeat(64), hardExpiresAt: 7_200 });
    await expect(expirePracticeLease("11111111-1111-4111-8111-111111111111", "hard", { nowMs: 1_000, redis, release: async () => { throw new Error("must not run"); } })).rejects.toThrow("before its lease deadline");
    const result = await expirePracticeLease("11111111-1111-4111-8111-111111111111", "hard", { nowMs: 7_200_000, redis, release: async () => { throw new Error("must not run"); } });
    expect(result).toEqual({ released: false, cleared: true, reason: "uncertain-window-elapsed" });
  });

  it("continues past a poisoned due lease so later sessions are still released", async () => {
    const leases = {
      "11111111-1111-4111-8111-111111111111": { state: "active", holderHash: "a".repeat(64), ipHash: "b".repeat(64), sessionId: "provider-fail-123", sessionIdHash: "c".repeat(64), hardExpiresAt: 100 },
      "22222222-2222-4222-8222-222222222222": { state: "active", holderHash: "d".repeat(64), ipHash: "e".repeat(64), sessionId: "provider-ok-456", sessionIdHash: "f".repeat(64), hardExpiresAt: 100 },
    };
    const released = [];
    const redis = {
      async hgetall(key) { return leases[Object.keys(leases).find((id) => key.endsWith(id))]; },
      async set() { return "OK"; },
      async del() { return 1; },
      async eval(script, keys) {
        if (script.includes("saa.due.v1")) return Object.keys(leases);
        if (script.includes("saa.close.v1")) return 1;
        if (script.includes("saa.release-lock.v1")) return 1;
        if (script.includes("saa.defer-or-prune.v1")) return ["deferred", 115, 1];
        throw new Error(`unexpected script ${keys}`);
      },
    };
    const results = await reapDuePracticeLeases({ nowMs: 100_000, redis, release: async (id) => {
      if (id === "provider-fail-123") throw new Error("poisoned");
      released.push(id); return true;
    } });
    expect(results[0]).toMatchObject({ reason: "cleanup-deferred", retryAt: 115, failures: 1 });
    expect(results[1].released).toBe(true);
    expect(released).toEqual(["provider-ok-456"]);
  });

  it("prunes a stale due index instead of retrying it forever", async () => {
    const redis = {
      async hgetall() { return null; },
      async eval(script) {
        if (script.includes("saa.due.v1")) return ["11111111-1111-4111-8111-111111111111"];
        if (script.includes("saa.defer-or-prune.v1")) return ["pruned", 0, 0];
        throw new Error("unexpected script");
      },
    };
    const results = await reapDuePracticeLeases({ nowMs: 100_000, redis, release: async () => { throw new Error("must not run"); } });
    expect(results).toEqual([{ leaseId: "11111111-1111-4111-8111-111111111111", released: false, reason: "stale-index-pruned" }]);
  });

  it("releases an unredeemed provider session at the pairing deadline", async () => {
    const released = [];
    const redis = fakeRedis({
      state: "pairing", holderHash: "a".repeat(64), ipHash: "b".repeat(64),
      sessionId: "provider-session-123", sessionIdHash: "c".repeat(64), pairingExpiresAt: 100, hardExpiresAt: 1_000,
    });
    const result = await expirePracticeLease("11111111-1111-4111-8111-111111111111", "pairing", { nowMs: 100_000, redis, release: async (id) => { released.push(id); return true; } });
    expect(result).toEqual({ released: true, reason: "pairing" });
    expect(released).toEqual(["provider-session-123"]);
  });

  it("does not release a redeemed lease when the pairing delivery arrives", async () => {
    const redis = fakeRedis({ state: "active", pairingExpiresAt: 100, hardExpiresAt: 1_000 });
    const result = await expirePracticeLease("11111111-1111-4111-8111-111111111111", "pairing", { nowMs: 100_000, redis, release: async () => { throw new Error("must not run"); } });
    expect(result).toEqual({ released: false, reason: "already-redeemed" });
  });

  it("releases an active lease at its absolute deadline and is idempotent", async () => {
    const released = [];
    const redis = fakeRedis({
      state: "active", holderHash: "a".repeat(64), ipHash: "b".repeat(64),
      sessionId: "provider-session-123", sessionIdHash: "c".repeat(64), pairingExpiresAt: 100, hardExpiresAt: 1_000,
    });
    const first = await expirePracticeLease("11111111-1111-4111-8111-111111111111", "hard", { nowMs: 1_000_000, redis, release: async (id) => { released.push(id); return true; } });
    const second = await expirePracticeLease("11111111-1111-4111-8111-111111111111", "hard", { nowMs: 1_001_000, redis, release: async () => { throw new Error("must not run twice"); } });
    expect(first.released).toBe(true);
    expect(second).toEqual({ released: false, reason: "already-closed" });
    expect(released).toHaveLength(1);
  });

  it("fails closed and leaves the lease active when provider release fails", async () => {
    const redis = fakeRedis({
      state: "active", holderHash: "a".repeat(64), ipHash: "b".repeat(64),
      sessionId: "provider-session-123", sessionIdHash: "c".repeat(64), pairingExpiresAt: 100, hardExpiresAt: 1_000,
    });
    await expect(expirePracticeLease("11111111-1111-4111-8111-111111111111", "hard", { nowMs: 1_000_000, redis, release: async () => { throw new Error("provider unavailable"); } })).rejects.toThrow("provider unavailable");
    expect((await redis.hgetall()).state).toBe("active");
  });
});
