import { describe, expect, it } from "vitest";
import { formatPracticeObservation, sanitizeRemoteError } from "./remote-arena.mjs";
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
});
