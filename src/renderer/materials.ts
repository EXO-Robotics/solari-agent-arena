import * as THREE from "three";
import { VISUAL_MATERIAL_NAMES, type VisualMaterialName } from "../model/visualContract";

export const HORIZON = 0x7a8288;
export const STATUS_CYAN = 0x5cffe1;

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
    return new THREE.MeshStandardMaterial({ color: 0x6a6e68, roughness: 0.42, metalness: 0.55 });
  }
  if (kind === "crate") {
    return new THREE.MeshStandardMaterial({ color: 0x6d675c, roughness: 0.84, metalness: 0.04 });
  }
  if (kind === "asphalt") {
    return new THREE.MeshStandardMaterial({ color: 0x2c2e2c, roughness: 0.95, metalness: 0 });
  }
  return new THREE.MeshStandardMaterial({ color: 0x8b8a84, roughness: 0.88, metalness: 0.02 });
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
