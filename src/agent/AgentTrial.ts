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
  private course = AGENT_COURSE;
  private phase: AgentTrialPhase = "idle";
  private seed = 0;
  private startedAt = 0;
  private checkpointIndex = 0;
  private collisions = 0;
  private collisionActive = false;
  private commandedMs = 0;
  private readonly actions: AgentAction[] = [];

  configureCourse(course: typeof AGENT_COURSE): void {
    this.course = course;
  }

  reset(seed: number, simulationTime: number): void {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("seed must be a uint32 integer.");
    this.phase = "running";
    this.seed = seed >>> 0;
    this.startedAt = simulationTime;
    this.checkpointIndex = 0;
    this.collisions = 0;
    this.collisionActive = false;
    this.commandedMs = 0;
    this.actions.length = 0;
  }

  recordAction(input: { drive: number; turn: number; durationMs: number; expectedSequence?: number }): AgentAction {
    if (this.phase !== "running") throw new Error(`Agent trial is ${this.phase}; reset before acting.`);
    validateAgentAction(input, this.course);
    if (input.expectedSequence !== undefined && input.expectedSequence !== this.actions.length) throw new Error(`Expected action sequence ${this.actions.length}.`);
    if (this.actions.length >= this.course.maxActions) throw new Error("Agent action budget exhausted.");
    if (this.commandedMs + input.durationMs > this.course.maxSeconds * 1_000) throw new Error("Agent simulated-time budget exhausted.");
    const action = Object.freeze({ sequence: this.actions.length, drive: input.drive, turn: input.turn, durationMs: input.durationMs });
    this.actions.push(action);
    this.commandedMs += input.durationMs;
    return action;
  }

  update(frame: SensorFrame, worldCollision: boolean, fallen: boolean): void {
    if (this.phase !== "running") return;
    if (worldCollision && !this.collisionActive) this.collisions += 1;
    this.collisionActive = worldCollision;
    const next = this.course.checkpoints[this.checkpointIndex];
    if (next && Math.hypot(frame.position - next.x, frame.lateral - next.y) <= next.radius) this.checkpointIndex += 1;
    if (this.checkpointIndex >= this.course.checkpoints.length) this.phase = "complete";
    else if (fallen) this.phase = "fallen";
    else if (frame.time - this.startedAt >= this.course.maxSeconds) this.phase = "time_limit";
  }

  observation(frame: SensorFrame): AgentObservation {
    return {
      schemaVersion: AGENT_TOOL_VERSION,
      courseId: this.course.courseId,
      phase: this.phase,
      simulatedTimeSeconds: Math.max(0, frame.time - this.startedAt),
      position: { x: frame.position, y: frame.lateral, height: frame.height },
      yawRadians: frame.yaw,
      speedMps: frame.velocity,
      bodyPitchRadians: frame.imu.pitch,
      checkpoints: {
        reached: this.checkpointIndex,
        total: this.course.checkpoints.length,
        nextId: this.course.checkpoints[this.checkpointIndex]?.id ?? null,
      },
      collisions: this.collisions,
      actionsUsed: this.actions.length,
      actionBudget: this.course.maxActions,
    };
  }

  transcript(): AgentTranscript {
    return {
      schemaVersion: AGENT_TRANSCRIPT_VERSION,
      courseId: this.course.courseId,
      seed: this.seed,
      actions: this.actions.map((action) => ({ ...action })),
    };
  }
}
