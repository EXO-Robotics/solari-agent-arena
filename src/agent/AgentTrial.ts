import type { SensorFrame } from "../sim/types";
import {
  AGENT_COURSE,
  AGENT_TOOL_VERSION,
  AGENT_TRANSCRIPT_VERSION,
  type AgentAction,
  type AgentObservation,
  type AgentTranscript,
  type AgentTrialPhase,
  validateAgentAction,
} from "./contract";

export class AgentTrial {
  private phase: AgentTrialPhase = "idle";
  private seed = 0;
  private startedAt = 0;
  private checkpointIndex = 0;
  private collisions = 0;
  private collisionActive = false;
  private readonly actions: AgentAction[] = [];

  reset(seed: number, simulationTime: number): void {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be a uint32 integer.");
    this.phase = "running";
    this.seed = seed >>> 0;
    this.startedAt = simulationTime;
    this.checkpointIndex = 0;
    this.collisions = 0;
    this.collisionActive = false;
    this.actions.length = 0;
  }

  recordAction(input: { drive: number; turn: number; durationMs: number }): AgentAction {
    if (this.phase !== "running") throw new Error(`Agent trial is ${this.phase}; reset before acting.`);
    validateAgentAction(input);
    if (this.actions.length >= AGENT_COURSE.maxActions) throw new Error("Agent action budget exhausted.");
    const action = Object.freeze({ sequence: this.actions.length, ...input });
    this.actions.push(action);
    return action;
  }

  update(frame: SensorFrame, worldCollision: boolean, fallen: boolean): void {
    if (this.phase !== "running") return;
    if (worldCollision && !this.collisionActive) this.collisions += 1;
    this.collisionActive = worldCollision;
    const next = AGENT_COURSE.checkpoints[this.checkpointIndex];
    if (next && Math.hypot(frame.position - next.x, frame.lateral - next.y) <= next.radius) this.checkpointIndex += 1;
    if (this.checkpointIndex >= AGENT_COURSE.checkpoints.length) this.phase = "complete";
    else if (fallen) this.phase = "fallen";
    else if (frame.time - this.startedAt >= AGENT_COURSE.maxSeconds) this.phase = "time_limit";
  }

  observation(frame: SensorFrame): AgentObservation {
    return {
      schemaVersion: AGENT_TOOL_VERSION,
      courseId: AGENT_COURSE.courseId,
      phase: this.phase,
      simulatedTimeSeconds: Math.max(0, frame.time - this.startedAt),
      position: { x: frame.position, y: frame.lateral, height: frame.height },
      yawRadians: frame.yaw,
      speedMps: frame.velocity,
      bodyPitchRadians: frame.imu.pitch,
      checkpoints: {
        reached: this.checkpointIndex,
        total: AGENT_COURSE.checkpoints.length,
        nextId: AGENT_COURSE.checkpoints[this.checkpointIndex]?.id ?? null,
      },
      collisions: this.collisions,
      actionsUsed: this.actions.length,
      actionBudget: AGENT_COURSE.maxActions,
    };
  }

  transcript(): AgentTranscript {
    return {
      schemaVersion: AGENT_TRANSCRIPT_VERSION,
      courseId: AGENT_COURSE.courseId,
      seed: this.seed,
      actions: this.actions.map((action) => ({ ...action })),
    };
  }
}
