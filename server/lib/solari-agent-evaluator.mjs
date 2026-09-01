import { readFile } from "node:fs/promises";
import { SandboxClient } from "@solarisdk/sandbox";
import { finalizeRun, sha256 } from "./evidence.mjs";
import { validateAgentEvaluationRequest } from "./agent-validation.mjs";

const COMMAND_DEADLINE_MS = 60_000;
const SANDBOX_IDLE_TIMEOUT_MS = 90_000;
const UNPACK_DEADLINE_MS = 15_000;

function allFinite(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === "object") return Object.values(value).every(allFinite);
  return typeof value === "string" || typeof value === "boolean" || value === null;
}

export function validateAgentRunnerPayload(value) {
  if (!value || typeof value !== "object") throw new Error("agent runner artifact is not an object");
  if (!["course_complete", "transcript_exhausted", "fallen", "time_limit"].includes(value.outcome)) throw new Error("agent runner outcome is unsupported");
  if (!value.metrics || !value.telemetry || !Array.isArray(value.telemetry.samples) || !Array.isArray(value.actionResults)) throw new Error("agent runner artifact shape mismatch");
  if (value.telemetry.sampleCount !== value.telemetry.samples.length) throw new Error("agent runner sample count mismatch");
  if (!allFinite(value.metrics) || !allFinite(value.actionResults) || !allFinite(value.telemetry.samples)) throw new Error("agent runner artifact contains non-finite values");
  if (value.metrics.checkpoints < 0 || value.metrics.checkpoints > value.metrics.checkpointsTotal) throw new Error("agent checkpoint metrics are invalid");
  let previousTime = -Infinity;
  for (const sample of value.telemetry.samples) {
    if (!Array.isArray(sample.qpos) || sample.qpos.length !== 20 || !Array.isArray(sample.qvel) || sample.qvel.length !== 20) throw new Error("agent replay state shape mismatch");
    if (sample.time <= previousTime || sample.time !== sample.frame?.time) throw new Error("agent replay timeline mismatch");
    previousTime = sample.time;
  }
  const telemetryHash = sha256(value.telemetry.samples);
  if (telemetryHash !== value.telemetry.hash) throw new Error("agent runner telemetry hash mismatch");
  return { outcome: value.outcome, metrics: value.metrics, actionResults: value.actionResults, telemetry: { ...value.telemetry, hash: telemetryHash } };
}

export function parseAgentRunnerOutput(result, artifactText) {
  const resultLine = result.stdout.split("\n").find((line) => line.startsWith("SOLARI_AGENT_RESULT="));
  if (result.exitCode === 0 && resultLine && artifactText) return validateAgentRunnerPayload(JSON.parse(artifactText));
  const errorLine = result.stderr.split("\n").find((line) => line.startsWith("SOLARI_AGENT_ERROR="));
  if (errorLine) throw new Error(`agent_runner_rejected:${errorLine.slice(19)}`);
  if (result.exitCode === 124) throw new Error("agent_runner_command_timeout");
  throw new Error("agent_runner_failed_without_structured_output");
}

export async function evaluateAgentTranscriptInSolari({ transcript, agentLabel, runId, startedAt, apiKey, template = "base", resources, clientFactory = (options) => new SandboxClient(options) }) {
  const validated = validateAgentEvaluationRequest({ transcript, agentLabel });
  const canonicalTranscript = validated.transcript;
  const canonicalAgentLabel = validated.agentLabel;
  const [runner, packageJson, packageLock, dependencyBundle, model, course, rootLockText] = await Promise.all([
    readFile(new URL("../runner/agent-runner.mjs", import.meta.url), "utf8"),
    readFile(new URL("../runner/package.json", import.meta.url), "utf8"),
    readFile(new URL("../runner/package-lock.json", import.meta.url), "utf8"),
    readFile(new URL("../runner/runner-dependencies.tgz", import.meta.url)),
    readFile(new URL("../../src/model/h1-sagittal.xml", import.meta.url), "utf8"),
    readFile(new URL("../../src/agent/course.json", import.meta.url), "utf8"),
    readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
  ]);
  const transcriptHash = sha256(canonicalTranscript);
  const rootLock = JSON.parse(rootLockText);
  const sdkVersion = rootLock.packages?.["node_modules/@solarisdk/sandbox"]?.version;
  if (typeof sdkVersion !== "string") throw new Error("sandbox_sdk_version_missing_from_lockfile");
  const client = clientFactory({ apiKey, baseUrl: "https://api.getsolari.com", callTimeoutMs: 90_000 });
  const wallStart = Date.now(); let sandbox; let sandboxTerminated = false; let payload; let infrastructureError; let sandboxIdHash;
  try {
    sandbox = await client.create({
      template, cpu: resources?.cpu ?? 2, memMb: resources?.memMb ?? 4096,
      timeoutMs: SANDBOX_IDLE_TIMEOUT_MS, lifecycle: { onTimeout: "kill" },
      metadata: { project: "solari-agent-arena", runId, evaluation: "agent-transcript" },
    });
    sandboxIdHash = sha256(sandbox.id);
    await sandbox.connect(); await sandbox.files.mkdir("/work");
    await Promise.all([
      sandbox.files.write("/work/agent-runner.mjs", runner),
      sandbox.files.write("/work/package.json", packageJson),
      sandbox.files.write("/work/package-lock.json", packageLock),
      sandbox.files.write("/work/h1-sagittal.xml", model),
      sandbox.files.write("/work/course.json", course),
      sandbox.files.write("/work/input.json", JSON.stringify({ transcript: canonicalTranscript })),
      sandbox.files.upload("/work/runner-dependencies.tgz", dependencyBundle),
    ]);
    const unpack = await sandbox.commands.run("tar", { args: ["-xzf", "/work/runner-dependencies.tgz", "-C", "/work"], cwd: "/work", timeoutMs: UNPACK_DEADLINE_MS });
    if (unpack.exitCode !== 0) throw new Error(`sandbox_dependency_unpack_failed:${unpack.stderr.slice(0, 500)}`);
    const result = await sandbox.commands.run("node", {
      args: ["/work/agent-runner.mjs", "/work/input.json", "/work/h1-sagittal.xml", "/work/course.json", "/work/result.json"],
      cwd: "/work", timeoutMs: COMMAND_DEADLINE_MS,
    });
    const artifactText = result.exitCode === 0 ? await sandbox.files.readText("/work/result.json") : undefined;
    payload = parseAgentRunnerOutput(result, artifactText);
  } catch (error) { infrastructureError = error; }
  finally {
    if (sandbox) { try { await sandbox.kill(); sandboxTerminated = true; } catch { sandboxTerminated = false; } }
  }
  if (infrastructureError) throw new Error(`solari_agent_evaluation_infrastructure_failure:${String(infrastructureError?.message ?? infrastructureError)}`);
  if (!sandbox || !sandboxIdHash || !payload) throw new Error("solari_agent_evaluation_incomplete");
  if (!sandboxTerminated) throw new Error("solari_sandbox_teardown_unconfirmed");
  const completedAt = new Date().toISOString();
  return finalizeRun({
    schemaVersion: "solari.arena.agent-run.v1", runId,
    controllerHash: transcriptHash, transcriptHash, seed: canonicalTranscript.seed,
    agent: { label: canonicalAgentLabel, runtime: "external-not-isolated", controllerArtifact: "bounded-action-transcript" },
    execution: {
      provider: "solari", product: "sandbox", sdkVersion, sandboxIdHash, templateId: template, authoritative: true,
      isolation: { type: "hardware-isolated-microvm", basis: "solari-product-documentation", attested: false },
      authoritativeBoundary: "validated-transcript-replay-and-scoring", simulator: "mujoco-wasm-3.12.0",
      runnerHash: sha256(runner), modelHash: sha256(model), courseHash: sha256(course), dependencyBundleHash: sha256(dependencyBundle),
      startedAt, completedAt, wallTimeMs: Date.now() - wallStart, commandDeadlineMs: COMMAND_DEADLINE_MS,
      unpackDeadlineMs: UNPACK_DEADLINE_MS, sandboxIdleTimeoutMs: SANDBOX_IDLE_TIMEOUT_MS,
      networkPolicy: "not-enforced-no-egress-required", attestation: "none", sandboxTerminated,
    },
    outcome: {
      status: payload.outcome === "course_complete" ? "succeeded" : payload.outcome === "fallen" ? "fallen" : payload.outcome === "time_limit" ? "time_limit" : "incomplete",
      reason: payload.outcome,
      hostImpactAssessment: "not-measured-per-run",
    },
    metrics: payload.metrics, actionResults: payload.actionResults, telemetry: payload.telemetry,
  });
}
