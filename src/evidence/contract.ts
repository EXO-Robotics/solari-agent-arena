import type { SensorFrame } from "../sim/types";

export const RUN_SCHEMA_VERSION = "solari.arena.run.v1" as const;

export type EvaluationStatus = "succeeded" | "timeout" | "rejected" | "runtime_error";

export interface ReplaySample {
  time: number;
  qpos: number[];
  qvel: number[];
  frame: SensorFrame;
}

export interface AuthoritativeRun {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  runId: string;
  controllerHash: string;
  seed: number;
  execution: {
    provider: "solari";
    product: "sandbox";
    sdkVersion: string;
    sandboxIdHash: string;
    templateId: string;
    authoritative: true;
    isolation: {
      type: "hardware-isolated-microvm";
      basis: "solari-product-documentation";
      attested: false;
    };
    controllerRuntime: "quickjs-wasm";
    simulator: "mujoco-wasm-3.12.0";
    runnerHash: string;
    modelHash: string;
    dependencyBundleHash: string;
    startedAt: string;
    completedAt: string;
    wallTimeMs: number;
    commandDeadlineMs: number;
    unpackDeadlineMs: number;
    sandboxIdleTimeoutMs: number;
    networkPolicy: "not-enforced-no-egress-required";
    attestation: "none";
    sandboxTerminated: boolean;
  };
  outcome: {
    status: EvaluationStatus;
    reason: string;
    hostImpactAssessment: "not-measured-per-run";
  };
  metrics: {
    checkpoints: number;
    checkpointsTotal: number;
    score: number;
    timeSeconds: number;
    collisions: number;
    distanceMeters: number;
    topSpeedMps: number;
    energyJoules: number;
  };
  telemetry: {
    sampleCount: number;
    hash: string;
    samples: ReplaySample[];
  };
  resultHash: string;
}

export function isAuthoritativeRun(value: unknown): value is AuthoritativeRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Partial<AuthoritativeRun>;
  return run.schemaVersion === RUN_SCHEMA_VERSION
    && typeof run.runId === "string"
    && /^[a-f0-9]{64}$/.test(run.controllerHash ?? "")
    && Number.isSafeInteger(run.seed)
    && run.execution?.provider === "solari"
    && run.execution?.product === "sandbox"
    && run.execution?.authoritative === true
    && run.execution?.isolation?.type === "hardware-isolated-microvm"
    && run.execution?.isolation?.basis === "solari-product-documentation"
    && run.execution?.isolation?.attested === false
    && run.outcome?.hostImpactAssessment === "not-measured-per-run"
    && run.execution?.sandboxTerminated === true
    && /^[a-f0-9]{64}$/.test(run.execution?.sandboxIdHash ?? "")
    && /^[a-f0-9]{64}$/.test(run.execution?.dependencyBundleHash ?? "")
    && Number.isFinite(run.metrics?.timeSeconds)
    && run.telemetry?.sampleCount === run.telemetry?.samples?.length
    && /^[a-f0-9]{64}$/.test(run.telemetry?.hash ?? "")
    && /^[a-f0-9]{64}$/.test(run.resultHash ?? "");
}
