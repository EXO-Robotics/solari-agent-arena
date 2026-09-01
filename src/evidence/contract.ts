import type { SensorFrame } from "../sim/types";

export const RUN_SCHEMA_VERSION = "solari.arena.run.v1" as const;
export const AGENT_RUN_SCHEMA_VERSION = "solari.arena.agent-run.v1" as const;

export type EvaluationStatus = "succeeded" | "timeout" | "rejected" | "runtime_error" | "incomplete" | "fallen" | "time_limit";

export interface ReplaySample {
  time: number;
  qpos: number[];
  qvel: number[];
  frame: SensorFrame;
}

export interface AuthoritativeRun {
  schemaVersion: typeof RUN_SCHEMA_VERSION | typeof AGENT_RUN_SCHEMA_VERSION;
  runId: string;
  controllerHash: string;
  transcriptHash?: string;
  agent?: {
    label: string;
    runtime: "external-not-isolated";
    controllerArtifact: "bounded-action-transcript";
  };
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
    controllerRuntime?: "quickjs-wasm";
    authoritativeBoundary?: "validated-transcript-replay-and-scoring";
    simulator: "mujoco-wasm-3.12.0";
    runnerHash: string;
    modelHash: string;
    courseHash?: string;
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
    actionsUsed?: number;
  };
  actionResults?: Array<{
    sequence: number;
    time: number;
    position: { x: number; y: number };
    yaw: number;
    checkpoints: number;
    collisions: number;
  }>;
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
  const supportedSchema = run.schemaVersion === RUN_SCHEMA_VERSION || run.schemaVersion === AGENT_RUN_SCHEMA_VERSION;
  const validAgentFields = run.schemaVersion !== AGENT_RUN_SCHEMA_VERSION || (
    /^[a-f0-9]{64}$/.test(run.transcriptHash ?? "")
    && run.transcriptHash === run.controllerHash
    && run.agent?.runtime === "external-not-isolated"
    && run.agent?.controllerArtifact === "bounded-action-transcript"
    && run.execution?.authoritativeBoundary === "validated-transcript-replay-and-scoring"
  );
  return supportedSchema
    && validAgentFields
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
