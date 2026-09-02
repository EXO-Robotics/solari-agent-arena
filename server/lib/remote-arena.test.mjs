import { describe, expect, it } from "vitest";
import {
  arenaToolApiReady, formatPracticeObservation, remoteFailurePhase, sanitizeRemoteError, settleFailedPracticeTicket,
} from "./remote-arena.mjs";
import { readFileSync } from "node:fs";

const claims = {
  courseId: "practice-first-steps-v1", courseHash: "a".repeat(64), seed: 42,
  track: "state-v1", maxActions: 48, maxSeconds: 24,
};
const observation = {
  phase: "running", simulatedTimeSeconds: 1.2, position: { x: 3, y: 0.5, height: 1.1 }, yawRadians: 0.2,
  speedMps: 0.8, bodyPitchRadians: 0.01, checkpoints: { reached: 1, total: 3, nextId: "wide-turn" },
  collisions: 0, actionsUsed: 2, actionBudget: 48,
};

describe("remote practice disclosure boundary", () => {
  it("returns exact pose only on the state track", () => {
    expect(formatPracticeObservation(claims, observation)).toMatchObject({ position: { x: 3 }, yawRadians: 0.2, nextExpectedSequence: 2 });
  });

  it("recursively omits pose, yaw, velocity, pitch, and checkpoint coordinates on vision", () => {
    const value = formatPracticeObservation({ ...claims, track: "vision-v1" }, observation);
    const text = JSON.stringify(value);
    for (const forbidden of ["position", "yawRadians", "speedMps", "bodyPitchRadians", '"x"', '"y"']) expect(text).not.toContain(forbidden);
    expect(value).toMatchObject({ track: "vision-v1", checkpoints: { reached: 1, nextId: "wide-turn" }, nextExpectedSequence: 2 });
    const css = readFileSync(new URL("../../src/style.css", import.meta.url), "utf8");
    expect(css).toContain(".simulation--vision-capture > :not(#viewport)");
  });

  it("does not reflect infrastructure errors or secrets", () => {
    expect(sanitizeRemoteError(new Error("wss://secret.getsolari.com/cdp/sid-123"))).toBe("Arena request failed safely. No authoritative result was created.");
  });

  it("treats the tool API, not an early DOM marker, as Arena readiness", () => {
    const readyApi = Object.fromEntries(["reset", "manifest", "observe", "transcript", "act"].map((method) => [method, () => method]));
    expect(arenaToolApiReady({ agentPhaseElement: true })).toBe(false);
    expect(arenaToolApiReady({ ...readyApi, act: undefined })).toBe(false);
    expect(arenaToolApiReady(readyApi)).toBe(true);
    const source = readFileSync(new URL("./remote-arena.mjs", import.meta.url), "utf8");
    expect(source).toContain("page.waitForFunction");
    expect(source).not.toContain("waitForSelector('[data-testid=\"agent-phase\"]')");
  });

  it("reports only allowlisted ticket phases for server-side diagnostics", () => {
    expect(remoteFailurePhase({ remotePhase: "arena-ready" })).toBe("arena-ready");
    expect(remoteFailurePhase({ remotePhase: "wss://secret.example/session" })).toBe("unknown");
    expect(remoteFailurePhase(new Error("secret"))).toBe("unknown");
  });

  it("retains quota and binds cleanup when provider deletion is not confirmed", async () => {
    const calls = [];
    const context = {
      admission: { leaseId: "11111111-1111-4111-8111-111111111111" },
      creatingAdmission: { leaseId: "11111111-1111-4111-8111-111111111111" },
      session: { id: "provider-session-123" }, committed: undefined,
      claims: { hardExpiresAt: new Date(Date.now() + 1_200_000).toISOString() }, arenaUrl: "https://arena.example",
    };
    const result = await settleFailedPracticeTicket(context, {
      cancelPending: async () => { calls.push("cancel"); },
      releaseProvider: async () => { calls.push("release-failed"); throw new Error("unconfirmed"); },
      abandonLease: async () => { calls.push("abandon"); },
      bindOrphan: async () => { calls.push("bind-orphan"); return true; },
      scheduleExpiry: async () => { calls.push("schedule-expiry"); },
    });
    expect(result).toEqual({ retained: true, reason: "provider-release-unconfirmed" });
    expect(calls).toEqual(["release-failed", "bind-orphan", "schedule-expiry"]);
  });

  it("frees active capacity only after provider deletion is confirmed", async () => {
    const calls = [];
    const result = await settleFailedPracticeTicket({
      admission: { leaseId: "11111111-1111-4111-8111-111111111111" },
      creatingAdmission: { leaseId: "11111111-1111-4111-8111-111111111111" },
      session: { id: "provider-session-123" }, committed: undefined,
    }, {
      releaseProvider: async () => { calls.push("release"); return true; },
      abandonLease: async () => { calls.push("abandon"); },
    });
    expect(result.retained).toBe(false);
    expect(calls).toEqual(["release", "abandon"]);
  });
});
