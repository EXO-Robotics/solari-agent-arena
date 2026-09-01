import courseDefinition from "./course.json";

export const AGENT_TOOL_VERSION = "solari.arena.agent-tools.v1" as const;
export const AGENT_TRANSCRIPT_VERSION = "solari.arena.agent-transcript.v1" as const;

export interface CourseCheckpoint {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface AgentCourse {
  schemaVersion: "solari.arena.course.v1";
  courseId: string;
  maxSeconds: number;
  maxActions: number;
  maxActionDurationMs: number;
  maxDrive: number;
  maxTurn: number;
  checkpoints: CourseCheckpoint[];
}

export const AGENT_COURSE = courseDefinition as AgentCourse;

export interface AgentAction {
  sequence: number;
  drive: number;
  turn: number;
  durationMs: number;
}

export type AgentTrialPhase = "idle" | "running" | "complete" | "fallen" | "time_limit";

export interface AgentObservation {
  schemaVersion: typeof AGENT_TOOL_VERSION;
  courseId: string;
  phase: AgentTrialPhase;
  simulatedTimeSeconds: number;
  position: { x: number; y: number; height: number };
  yawRadians: number;
  speedMps: number;
  bodyPitchRadians: number;
  checkpoints: { reached: number; total: number; nextId: string | null };
  collisions: number;
  actionsUsed: number;
  actionBudget: number;
}

export interface AgentTranscript {
  schemaVersion: typeof AGENT_TRANSCRIPT_VERSION;
  courseId: string;
  seed: number;
  actions: AgentAction[];
}

export function validateAgentAction(input: { drive: number; turn: number; durationMs: number }, course: AgentCourse = AGENT_COURSE): void {
  if (![input.drive, input.turn, input.durationMs].every(Number.isFinite)) throw new Error("Agent action values must be finite numbers.");
  if (Math.abs(input.drive) > course.maxDrive) throw new Error(`drive must be between -${course.maxDrive} and ${course.maxDrive}.`);
  if (Math.abs(input.turn) > course.maxTurn) throw new Error(`turn must be between -${course.maxTurn} and ${course.maxTurn}.`);
  if (!Number.isInteger(input.durationMs) || input.durationMs < 100 || input.durationMs > course.maxActionDurationMs) {
    throw new Error(`durationMs must be an integer from 100 to ${course.maxActionDurationMs}.`);
  }
}
