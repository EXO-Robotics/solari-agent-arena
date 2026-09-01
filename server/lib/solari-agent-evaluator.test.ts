import { describe, expect, it } from "vitest";
import { sha256 } from "./evidence.mjs";
import { evaluateAgentTranscriptInSolari, validateAgentRunnerPayload } from "./solari-agent-evaluator.mjs";

const sample = { time: 0.1, qpos: Array(20).fill(0), qvel: Array(20).fill(0), frame: { time: 0.1 } };
const payload = {
  outcome: "course_complete",
  metrics: { checkpoints: 5, checkpointsTotal: 5, score: 10, timeSeconds: 0.1, collisions: 0, distanceMeters: 1, topSpeedMps: 1, energyJoules: 1, actionsUsed: 1 },
  actionResults: [{ sequence: 0, time: 0.1, position: { x: 1, y: 0 }, yaw: 0, checkpoints: 5, collisions: 0 }],
  telemetry: { sampleCount: 1, hash: sha256([sample]), samples: [sample] },
};
const transcript = { schemaVersion: "solari.arena.agent-transcript.v1", courseId: "arena-slalom-ramp-v1", seed: 42, actions: [{ sequence: 0, drive: 1, turn: 0, durationMs: 100 }] };

function fakeSandbox(kill = async () => undefined) {
  return {
    id: "sandbox-agent-test", connect: async () => undefined,
    files: { mkdir: async () => undefined, write: async () => undefined, upload: async () => undefined, readText: async () => JSON.stringify(payload) },
    commands: { run: async (command: string) => command === "tar" ? { exitCode: 0, stdout: "", stderr: "" } : { exitCode: 0, stdout: "SOLARI_AGENT_RESULT={}\n", stderr: "" } },
    kill,
  };
}

describe("Solari agent transcript evaluator", () => {
  it("rejects a forged telemetry hash", () => {
    expect(() => validateAgentRunnerPayload({ ...payload, telemetry: { ...payload.telemetry, hash: "0".repeat(64) } })).toThrow(/hash mismatch/);
  });

  it("issues agent authority only after confirmed Sandbox teardown", async () => {
    let killed = false;
    const run = await evaluateAgentTranscriptInSolari({
      transcript, agentLabel: "test-agent", runId: "agent-run", startedAt: new Date(0).toISOString(), apiKey: "test",
      clientFactory: () => ({ create: async () => fakeSandbox(async () => { killed = true; }) }),
    });
    expect(killed).toBe(true);
    expect(run).toMatchObject({
      schemaVersion: "solari.arena.agent-run.v1", runId: "agent-run",
      controllerHash: sha256(transcript), transcriptHash: sha256(transcript),
      agent: { runtime: "external-not-isolated", controllerArtifact: "bounded-action-transcript" },
      execution: { authoritative: true, authoritativeBoundary: "validated-transcript-replay-and-scoring", sandboxTerminated: true },
      outcome: { status: "succeeded", reason: "course_complete" },
    });
  });

  it("mints no artifact when teardown is unconfirmed", async () => {
    await expect(evaluateAgentTranscriptInSolari({
      transcript, agentLabel: "test-agent", runId: "agent-kill-fail", startedAt: new Date(0).toISOString(), apiKey: "test",
      clientFactory: () => ({ create: async () => fakeSandbox(async () => { throw new Error("unavailable"); }) }),
    })).rejects.toThrow(/teardown_unconfirmed/);
  });
});
