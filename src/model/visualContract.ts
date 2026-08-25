export const VISUAL_LINK_NAMES = [
  "pelvis",
  "torso",
  "head",
  "left_upper_arm",
  "left_forearm",
  "right_upper_arm",
  "right_forearm",
  "left_thigh",
  "left_shin",
  "left_foot",
  "right_thigh",
  "right_shin",
  "right_foot",
] as const;

export type VisualLinkName = (typeof VISUAL_LINK_NAMES)[number];

export const VISUAL_MATERIAL_NAMES = [
  "AION_Cover",
  "AION_Anodized",
  "AION_Aluminum",
  "AION_Rubber",
  "AION_Visor",
  "AION_LED",
] as const;

export type VisualMaterialName = (typeof VISUAL_MATERIAL_NAMES)[number];

export interface VisualLinkContract {
  name: VisualLinkName;
  parent: VisualLinkName | null;
  restLocal: readonly [number, number, number];
  restWorld: readonly [number, number, number];
  hullCenter: readonly [number, number, number];
  hullHalfExtents: readonly [number, number, number];
  padding: number;
}

export const VISUAL_LINKS: readonly VisualLinkContract[] = [
  { name: "pelvis", parent: null, restLocal: [0, 0, 0.89], restWorld: [0, 0, 0.89], hullCenter: [0, 0, 0], hullHalfExtents: [0.13, 0.168, 0.095], padding: 0.04 },
  { name: "torso", parent: "pelvis", restLocal: [0, 0, 0.14], restWorld: [0, 0, 1.03], hullCenter: [0, 0, 0.19], hullHalfExtents: [0.156, 0.195, 0.23], padding: 0.045 },
  { name: "head", parent: "torso", restLocal: [0, 0, 0.51], restWorld: [0, 0, 1.54], hullCenter: [0, 0, 0.085], hullHalfExtents: [0.121, 0.105, 0.14], padding: 0.03 },
  { name: "left_upper_arm", parent: "torso", restLocal: [0, 0.255, 0.36], restWorld: [0, 0.255, 1.39], hullCenter: [0, 0, -0.145], hullHalfExtents: [0.055, 0.055, 0.2], padding: 0.03 },
  { name: "left_forearm", parent: "left_upper_arm", restLocal: [0, 0, -0.29], restWorld: [0, 0.255, 1.1], hullCenter: [0, 0, -0.16], hullHalfExtents: [0.048, 0.048, 0.2], padding: 0.03 },
  { name: "right_upper_arm", parent: "torso", restLocal: [0, -0.255, 0.36], restWorld: [0, -0.255, 1.39], hullCenter: [0, 0, -0.145], hullHalfExtents: [0.055, 0.055, 0.2], padding: 0.03 },
  { name: "right_forearm", parent: "right_upper_arm", restLocal: [0, 0, -0.29], restWorld: [0, -0.255, 1.1], hullCenter: [0, 0, -0.16], hullHalfExtents: [0.048, 0.048, 0.2], padding: 0.03 },
  { name: "left_thigh", parent: "pelvis", restLocal: [0, 0.1, -0.09], restWorld: [0, 0.1, 0.8], hullCenter: [0, 0, -0.185], hullHalfExtents: [0.075, 0.075, 0.26], padding: 0.035 },
  { name: "left_shin", parent: "left_thigh", restLocal: [0, 0, -0.37], restWorld: [0, 0.1, 0.43], hullCenter: [0, 0, -0.19], hullHalfExtents: [0.083, 0.083, 0.24], padding: 0.03 },
  { name: "left_foot", parent: "left_shin", restLocal: [0, 0, -0.36], restWorld: [0, 0.1, 0.07], hullCenter: [0.065, 0, -0.045], hullHalfExtents: [0.145, 0.068, 0.038], padding: 0.008 },
  { name: "right_thigh", parent: "pelvis", restLocal: [0, -0.1, -0.09], restWorld: [0, -0.1, 0.8], hullCenter: [0, 0, -0.185], hullHalfExtents: [0.075, 0.075, 0.26], padding: 0.035 },
  { name: "right_shin", parent: "right_thigh", restLocal: [0, 0, -0.37], restWorld: [0, -0.1, 0.43], hullCenter: [0, 0, -0.19], hullHalfExtents: [0.083, 0.083, 0.24], padding: 0.03 },
  { name: "right_foot", parent: "right_shin", restLocal: [0, 0, -0.36], restWorld: [0, -0.1, 0.07], hullCenter: [0.065, 0, -0.045], hullHalfExtents: [0.145, 0.068, 0.038], padding: 0.008 },
];

export const VISUAL_EXPORT = {
  units: "meters",
  up: "Z",
  forward: "+X",
  gltfYup: false,
  maxTriangles: 30_000,
  maxBytes: 1_500_000,
} as const;

export const VISUAL_MODEL_PUBLIC_PATH = "models/aion-h1s.glb";

export function visualModelUrl(): string {
  return `${import.meta.env.BASE_URL}${VISUAL_MODEL_PUBLIC_PATH}`;
}

export function isVisualLinkName(name: string): name is VisualLinkName {
  return (VISUAL_LINK_NAMES as readonly string[]).includes(name);
}
