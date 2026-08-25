import modelXml from "./h1-sagittal.xml?raw";
import { VISUAL_LINK_NAMES } from "./visualContract";

export const PHYSICS_MODEL_XML = modelXml;

export const PHYSICS_BODY_NAMES = VISUAL_LINK_NAMES;

export const PHYSICS_ACTUATOR_NAMES = [
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
  "balance_pitch",
  "balance_roll",
  "pace_x",
  "pace_y",
  "turn_drive",
  "balance_height",
] as const;

export const PHYSICS_NAMED_GEOMS = [
  "field_floor",
  "crate_a",
  "crate_b",
  "crate_c",
  "ramp",
  "low_wall",
  "gate_left",
  "gate_right",
  "gate_top",
  "beacon_north",
  "beacon_west",
  "beacon_east",
  "pelvis_shell",
  "pelvis_core",
  "torso_shell",
  "torso_panel",
  "torso_light",
  "neck",
  "head_shell",
  "visor",
  "visor_signal",
  "left_upper_arm_geom",
  "left_forearm_geom",
  "left_hand",
  "right_upper_arm_geom",
  "right_forearm_geom",
  "right_hand",
  "left_thigh_geom",
  "left_knee",
  "left_shin_geom",
  "left_foot_geom",
  "right_thigh_geom",
  "right_knee",
  "right_shin_geom",
  "right_foot_geom",
] as const;

export const PHYSICS_XML_BYTES = 10654;
export const PHYSICS_XML_SHA256 = "03ae3bc817fa4e748dd27e14a5cd84993994df910c2eeff412ef9bfc8b9912ec";

export function namedXmlBodies(xml: string = PHYSICS_MODEL_XML): string[] {
  return [...xml.matchAll(/<body name="([^"]+)"/g)].map((match) => match[1] ?? "");
}

export function namedXmlGeoms(xml: string = PHYSICS_MODEL_XML): string[] {
  return [...xml.matchAll(/<geom name="([^"]+)"/g)].map((match) => match[1] ?? "");
}

export function namedXmlActuators(xml: string = PHYSICS_MODEL_XML): string[] {
  return [...xml.matchAll(/<(?:position|velocity) name="([^"]+)"/g)].map((match) => match[1] ?? "");
}
