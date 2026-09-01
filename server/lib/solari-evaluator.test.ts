import { describe, expect, it } from "vitest";
import { evaluateInSolari, parseRunnerOutput, validateSuccessfulPayload } from "./solari-evaluator.mjs";

describe("Sandbox artifact validation", () => {
  it("rejects a forged telemetry hash before authority is issued", () => {
    const sample = {
      time: 0.04,
      qpos: Array(20).fill(0),
      qvel: Array(20).fill(0),
      frame: { time: 0.04 },
    };
    const value = {
      metrics: { checkpoints: 0, checkpointsTotal: 4, score: 0, timeSeconds: 8, collisions: 0, distanceMeters: 0, topSpeedMps: 0, energyJoules: 0 },
      telemetry: { sampleCount: 200, hash: "0".repeat(64), samples: Array.from({ length: 200 }, (_, index) => ({ ...sample, time: (index + 1) * 0.04, frame: { time: (index + 1) * 0.04 } })) },
    };
    expect(() => validateSuccessfulPayload(value)).toThrow(/hash mismatch/);
  });

  it.each([
    [{ exitCode: 124, stdout: "", stderr: "" }, "timeout", "controller_step_timeout"],
    [{ exitCode: 1, stdout: "", stderr: 'SOLARI_ARENA_ERROR={"status":"runtime_error","reason":"controller-error:process is not defined"}\n' }, "rejected", "capability_violation"],
  ])("maps structured runner failures", (result, status, reason) => {
    expect(parseRunnerOutput(result, undefined)).toMatchObject({ status, reason });
  });

  it("refuses to mint an outcome from an unstructured runner failure", () => {
    expect(() => parseRunnerOutput({ exitCode: 1, stdout: "", stderr: "boom" }, undefined)).toThrow(/structured_output/);
  });

  it("does not mint authority when Sandbox creation fails", async () => {
    await expect(evaluateInSolari({
      controller: "function control() { return {}; }", seed: 42, runId: "run-create-fail",
      startedAt: new Date(0).toISOString(), apiKey: "test",
      clientFactory: () => ({ create: async () => { throw new Error("unavailable"); } }),
    })).rejects.toThrow(/infrastructure_failure/);
  });

  it("issues a structured timeout only after confirmed teardown", async () => {
    let killed = false;
    const sandbox = {
      id: "sandbox-test",
      connect: async () => undefined,
      files: { mkdir: async () => undefined, write: async () => undefined, upload: async () => undefined },
      commands: { run: async (command: string) => command === "tar"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 124, stdout: "", stderr: "" } },
      kill: async () => { killed = true; },
    };
    const run = await evaluateInSolari({
      controller: "function control() { while (true) {} }", seed: 42, runId: "run-timeout",
      startedAt: new Date(0).toISOString(), apiKey: "test",
      clientFactory: () => ({ create: async () => sandbox }),
    });
    expect(killed).toBe(true);
    expect(run).toMatchObject({
      runId: "run-timeout",
      execution: { authoritative: true, sandboxTerminated: true },
      outcome: { status: "timeout", hostImpactAssessment: "not-measured-per-run" },
    });
  });

  it("does not mint authority when teardown cannot be confirmed", async () => {
    const sandbox = {
      id: "sandbox-kill-fail",
      connect: async () => undefined,
      files: { mkdir: async () => undefined, write: async () => undefined, upload: async () => undefined },
      commands: { run: async (command: string) => command === "tar"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 124, stdout: "", stderr: "" } },
      kill: async () => { throw new Error("kill unavailable"); },
    };
    await expect(evaluateInSolari({
      controller: "function control() { while (true) {} }", seed: 42, runId: "run-kill-fail",
      startedAt: new Date(0).toISOString(), apiKey: "test",
      clientFactory: () => ({ create: async () => sandbox }),
    })).rejects.toThrow(/teardown_unconfirmed/);
  });
});
