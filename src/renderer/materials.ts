import * as THREE from "three";
import { VISUAL_MATERIAL_NAMES, type VisualMaterialName } from "../model/visualContract";

export const HORIZON = 0x030609;
export const STATUS_CYAN = 0x5cffe1;
export const STATUS_VIOLET = 0xa985ff;
export const OBSTACLE_ORANGE = 0xe94f26;

export function createMaterialRegistry(): Record<VisualMaterialName, THREE.MeshStandardMaterial> {
  const registry = {
    AION_Cover: new THREE.MeshStandardMaterial({
      name: "AION_Cover",
      color: 0xe6e2d8,
      roughness: 0.52,
      metalness: 0.04,
    }),
    AION_Anodized: new THREE.MeshStandardMaterial({
      name: "AION_Anodized",
      color: 0x161817,
      roughness: 0.32,
      metalness: 0.82,
    }),
    AION_Aluminum: new THREE.MeshStandardMaterial({
      name: "AION_Aluminum",
      color: 0xc5c8c2,
      roughness: 0.26,
      metalness: 0.9,
    }),
    AION_Rubber: new THREE.MeshStandardMaterial({
      name: "AION_Rubber",
      color: 0x111111,
      roughness: 0.92,
      metalness: 0,
    }),
    AION_Visor: new THREE.MeshStandardMaterial({
      name: "AION_Visor",
      color: 0x070c0a,
      roughness: 0.06,
      metalness: 0.12,
    }),
    AION_LED: new THREE.MeshStandardMaterial({
      name: "AION_LED",
      color: 0x0a1c18,
      emissive: STATUS_CYAN,
      emissiveIntensity: 2.4,
      roughness: 0.35,
      metalness: 0.1,
    }),
  } satisfies Record<VisualMaterialName, THREE.MeshStandardMaterial>;
  return registry;
}

export function createCollisionMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: STATUS_CYAN,
    transparent: true,
    opacity: 0.22,
    roughness: 1,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function fieldMaterial(kind: "concrete" | "metal" | "crate" | "asphalt"): THREE.MeshStandardMaterial {
  if (kind === "metal") {
    return new THREE.MeshStandardMaterial({ color: 0x142b31, roughness: 0.24, metalness: 0.82, emissive: 0x091c20, emissiveIntensity: 0.34 });
  }
  if (kind === "crate") {
    return new THREE.MeshStandardMaterial({ color: OBSTACLE_ORANGE, roughness: 0.32, metalness: 0.38, emissive: 0x3a0b02, emissiveIntensity: 0.72 });
  }
  if (kind === "asphalt") {
    return new THREE.MeshStandardMaterial({ color: 0x081015, roughness: 0.88, metalness: 0.16 });
  }
  return new THREE.MeshStandardMaterial({ color: 0x253137, roughness: 0.68, metalness: 0.28, emissive: 0x071216, emissiveIntensity: 0.24 });
}

export function fieldKindForGeom(name: string): "concrete" | "metal" | "crate" | "asphalt" {
  if (name.startsWith("crate")) return "crate";
  if (name === "ramp" || name.startsWith("gate")) return "metal";
  if (name === "field_floor") return "asphalt";
  return "concrete";
}

export function assertMaterialNames(names: string[]): void {
  const missing = VISUAL_MATERIAL_NAMES.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`Visual model is missing materials: ${missing.join(", ")}`);
  }
}
