import { readFile } from "node:fs/promises";
import { SandboxClient } from "@solarisdk/sandbox";
import { finalizeRun, sha256 } from "./evidence.mjs";

const COMMAND_DEADLINE_MS = 30_000;
const SANDBOX_IDLE_TIMEOUT_MS = 90_000;
const UNPACK_DEADLINE_MS = 15_000;
const EMPTY_TELEMETRY_HASH = sha256([]);

function emptyTelemetry() {
  return { sampleCount: 0, hash: EMPTY_TELEMETRY_HASH, samples: [] };
}

function emptyMetrics() {
  return { checkpoints: 0, checkpointsTotal: 4, score: 0, timeSeconds: 0, collisions: 0, distanceMeters: 0, topSpeedMps: 0, energyJoules: 0 };
}

function allFinite(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === "object") return Object.values(value).every(allFinite);
  return typeof value === "string" || typeof value === "boolean" || value === null;
}

export function validateSuccessfulPayload(value) {
  if (!value || typeof value !== "object") throw new Error("runner artifact is not an object");
  const { metrics, telemetry } = value;
  if (!metrics || !telemetry || !Array.isArray(telemetry.samples)) throw new Error("runner artifact shape mismatch");
  if (telemetry.samples.length !== 200 || telemetry.sampleCount !== telemetry.samples.length) throw new Error("runner sample count mismatch");
  if (!allFinite(metrics) || !allFinite(telemetry.samples)) throw new Error("runner artifact contains non-finite values");
  let previousTime = -Infinity;
  for (const sample of telemetry.samples) {
    if (!Array.isArray(sample.qpos) || sample.qpos.length !== 20 || !Array.isArray(sample.qvel) || sample.qvel.length !== 20) throw new Error("runner replay state shape mismatch");
    if (sample.time <= previousTime || sample.time !== sample.frame?.time) throw new Error("runner replay timeline mismatch");
    previousTime = sample.time;
  }
  const telemetryHash = sha256(telemetry.samples);
  if (telemetry.hash !== telemetryHash) throw new Error("runner telemetry hash mismatch");
  return { metrics, telemetry: { ...telemetry, hash: telemetryHash } };
}

export function parseRunnerOutput(result, artifactText) {
  const resultLine = result.stdout.split("\n").find((line) => line.startsWith("SOLARI_ARENA_RESULT="));
  if (result.exitCode === 0 && resultLine && artifactText) {
    return { status: "succeeded", reason: "normal_completion", ...validateSuccessfulPayload(JSON.parse(artifactText)) };
  }
  const errorLine = result.stderr.split("\n").find((line) => line.startsWith("SOLARI_ARENA_ERROR="));
  if (errorLine) {
    const detail = JSON.parse(errorLine.slice(19));
    const capability = /(?:process|require|fetch|document|window|Deno|Bun).*not defined/i.test(detail.reason ?? "");
    return { status: capability ? "rejected" : detail.status ?? "runtime_error", reason: capability ? "capability_violation" : detail.reason, metrics: emptyMetrics(), telemetry: emptyTelemetry() };
  }
  if (result.exitCode === 124) return { status: "timeout", reason: "controller_step_timeout", metrics: emptyMetrics(), telemetry: emptyTelemetry() };
  throw new Error("runner_failed_without_structured_output");
}

export async function evaluateInSolari({ controller, seed, runId, startedAt, apiKey, template = "base", resources, clientFactory = (options) => new SandboxClient(options) }) {
  const [runner, packageJson, packageLock, dependencyBundle, model, rootLockText] = await Promise.all([
    readFile(new URL("../runner/arena-runner.mjs", import.meta.url), "utf8"),
    readFile(new URL("../runner/package.json", import.meta.url), "utf8"),
    readFile(new URL("../runner/package-lock.json", import.meta.url), "utf8"),
    readFile(new URL("../runner/runner-dependencies.tgz", import.meta.url)),
    readFile(new URL("../../src/model/h1-sagittal.xml", import.meta.url), "utf8"),
    readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
  ]);
  const runnerHash = sha256(runner);
  const modelHash = sha256(model);
  const dependencyBundleHash = sha256(dependencyBundle);
  const rootLock = JSON.parse(rootLockText);
  const sdkVersion = rootLock.packages?.["node_modules/@solarisdk/sandbox"]?.version;
  if (typeof sdkVersion !== "string") throw new Error("sandbox_sdk_version_missing_from_lockfile");
  const client = clientFactory({ apiKey, baseUrl: "https://api.getsolari.com", callTimeoutMs: 45_000 });
  const wallStart = Date.now();
  let sandbox;
  let sandboxTerminated = false;
  let payload;
  let infrastructureError;
  let sandboxIdHash;
  try {
    sandbox = await client.create({
      template,
      cpu: resources?.cpu ?? 2,
      memMb: resources?.memMb ?? 4096,
      timeoutMs: SANDBOX_IDLE_TIMEOUT_MS,
      lifecycle: { onTimeout: "kill" },
      metadata: { project: "solari-agent-arena", runId },
    });
    sandboxIdHash = sha256(sandbox.id);
    await sandbox.connect();
    await sandbox.files.mkdir("/work");
    await Promise.all([
      sandbox.files.write("/work/arena-runner.mjs", runner),
      sandbox.files.write("/work/package.json", packageJson),
      sandbox.files.write("/work/package-lock.json", packageLock),
      sandbox.files.write("/work/h1-sagittal.xml", model),
      sandbox.files.write("/work/input.json", JSON.stringify({ controller, seed })),
      sandbox.files.upload("/work/runner-dependencies.tgz", dependencyBundle),
    ]);
    const unpack = await sandbox.commands.run("tar", {
      args: ["-xzf", "/work/runner-dependencies.tgz", "-C", "/work"],
      cwd: "/work",
      timeoutMs: UNPACK_DEADLINE_MS,
    });
    if (unpack.exitCode !== 0) throw new Error(`sandbox_dependency_unpack_failed:${unpack.stderr.slice(0, 500)}`);
    const result = await sandbox.commands.run("node", {
      args: ["/work/arena-runner.mjs", "/work/input.json", "/work/h1-sagittal.xml", "/work/result.json"],
      cwd: "/work",
      timeoutMs: COMMAND_DEADLINE_MS,
    });
    const artifactText = result.exitCode === 0 ? await sandbox.files.readText("/work/result.json") : undefined;
    payload = parseRunnerOutput(result, artifactText);
  } catch (error) {
    infrastructureError = error;
  } finally {
    if (sandbox) {
      try { await sandbox.kill(); sandboxTerminated = true; } catch { sandboxTerminated = false; }
    }
  }
  if (infrastructureError) throw new Error(`solari_evaluation_infrastructure_failure:${String(infrastructureError?.message ?? infrastructureError)}`);
  if (!sandbox || !sandboxIdHash || !payload) throw new Error("solari_evaluation_incomplete");
  if (!sandboxTerminated) throw new Error("solari_sandbox_teardown_unconfirmed");
  const completedAt = new Date().toISOString();
  return finalizeRun({
    schemaVersion: "solari.arena.run.v1",
    runId,
    controllerHash: sha256(controller),
    seed,
    execution: {
      provider: "solari", product: "sandbox", sdkVersion,
      sandboxIdHash, templateId: template, authoritative: true,
      isolation: { type: "hardware-isolated-microvm", basis: "solari-product-documentation", attested: false },
      controllerRuntime: "quickjs-wasm", simulator: "mujoco-wasm-3.12.0",
      runnerHash, modelHash, dependencyBundleHash, startedAt, completedAt, wallTimeMs: Date.now() - wallStart,
      commandDeadlineMs: COMMAND_DEADLINE_MS, unpackDeadlineMs: UNPACK_DEADLINE_MS,
      sandboxIdleTimeoutMs: SANDBOX_IDLE_TIMEOUT_MS,
      networkPolicy: "not-enforced-no-egress-required", attestation: "none", sandboxTerminated,
    },
    outcome: { status: payload.status, reason: payload.reason, hostImpactAssessment: "not-measured-per-run" },
    metrics: payload.metrics,
    telemetry: payload.telemetry,
  });
}
