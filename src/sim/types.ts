export const ACTUATOR_NAMES = [
  "left_hip_roll",
  "left_hip_pitch",
  "left_knee_pitch",
  "left_ankle_pitch",
  "left_ankle_roll",
  "right_hip_roll",
  "right_hip_pitch",
  "right_knee_pitch",
  "right_ankle_pitch",
  "right_ankle_roll",
  "left_shoulder_pitch",
  "left_elbow_pitch",
  "right_shoulder_pitch",
  "right_elbow_pitch",
] as const;

export type ActuatorName = (typeof ACTUATOR_NAMES)[number];

export interface SensorFrame {
  time: number;
  position: number;
  lateral: number;
  height: number;
  velocity: number;
  yaw: number;
  imu: {
    pitch: number;
    roll: number;
    pitchRate: number;
    accel: [number, number, number];
  };
  feet: {
    left: number;
    right: number;
  };
  joints: Record<ActuatorName, { position: number; velocity: number }>;
}

export type ActuatorTargets = Record<ActuatorName, number>;

export interface ControllerResult {
  targets: Partial<ActuatorTargets>;
  drive?: number;
  turn?: number;
}

export type RunPhase =
  | "loading"
  | "ready"
  | "countdown"
  | "running"
  | "paused"
  | "finished"
  | "fallen"
  | "error";

export interface TelemetrySample {
  time: number;
  distance: number;
  speed: number;
  pitch: number;
  energy: number;
  leftForce: number;
  rightForce: number;
  drive: number;
}
