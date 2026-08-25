import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VISUAL_LINK_NAMES,
  VISUAL_MATERIAL_NAMES,
  isVisualLinkName,
  type VisualLinkName,
} from "../model/visualContract";

function isRequiredLink(name: string): boolean {
  return isVisualLinkName(name);
}
import { assertMaterialNames } from "./materials";

export class VisualModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VisualModelError";
  }
}

export type VisualLinks = Record<VisualLinkName, THREE.Object3D>;

export function assertVisualSceneRoots(root: THREE.Object3D): void {
  const rootNames = root.children.map((node) => node.name);
  const missing = VISUAL_LINK_NAMES.filter((name) => !rootNames.includes(name));
  const unexpected = rootNames.filter((name) => !isRequiredLink(name));
  const duplicates = rootNames.filter((name, index) => rootNames.indexOf(name) !== index);
  if (missing.length > 0 || unexpected.length > 0 || duplicates.length > 0) {
    const details = [
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
      unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : "",
      duplicates.length > 0 ? `duplicates: ${[...new Set(duplicates)].join(", ")}` : "",
    ].filter(Boolean);
    throw new VisualModelError(`Visual model scene roots do not match the contract (${details.join("; ")})`);
  }
}

export function bindVisualLinks(root: THREE.Object3D): VisualLinks {
  const found = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    if (node === root || !isRequiredLink(node.name)) return;
    if (found.has(node.name)) {
      throw new VisualModelError(`Duplicate visual link node "${node.name}"`);
    }
    found.set(node.name, node);
  });

  const missing = VISUAL_LINK_NAMES.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new VisualModelError(`Visual model is missing required nodes: ${missing.join(", ")}`);
  }

  const links = {} as VisualLinks;
  const worldPoses = new Map<VisualLinkName, { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }>();
  for (const name of VISUAL_LINK_NAMES) {
    const node = found.get(name);
    if (!node) throw new VisualModelError(`Visual model is missing required node "${name}"`);
    node.updateWorldMatrix(true, false);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    node.matrixWorld.decompose(position, quaternion, scale);
    worldPoses.set(name, { position, quaternion, scale });
    links[name] = node;
  }
  for (const name of VISUAL_LINK_NAMES) {
    const node = links[name];
    const pose = worldPoses.get(name);
    if (!pose) throw new VisualModelError(`Missing bind pose for "${name}"`);
    if (node.parent) node.parent.remove(node);
    node.position.copy(pose.position);
    node.quaternion.copy(pose.quaternion);
    node.scale.copy(pose.scale);
    node.matrixAutoUpdate = true;
  }
  return links;
}

export function collectMaterialNames(root: THREE.Object3D): string[] {
  const names = new Set<string>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material?.name) names.add(material.name);
    }
  });
  return [...names];
}

export function prepareVisualMeshes(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = 0.85;
        if (material.name === "AION_LED") {
          material.emissive = new THREE.Color(0x5cffe1);
          material.emissiveIntensity = Math.max(material.emissiveIntensity, 2.2);
        }
      }
    }
  });
}

export function prepareAndBindVisualModel(root: THREE.Object3D): VisualLinks {
  root.name = "aion-h1s";
  assertVisualSceneRoots(root);
  const materials = collectMaterialNames(root);
  assertMaterialNames(materials);
  const unexpected = materials.filter((name) => !(VISUAL_MATERIAL_NAMES as readonly string[]).includes(name));
  if (unexpected.length > 0) {
    throw new VisualModelError(`Visual model has uncontracted materials: ${unexpected.join(", ")}`);
  }
  prepareVisualMeshes(root);
  return bindVisualLinks(root);
}

export async function loadVisualModel(url: string): Promise<{ root: THREE.Object3D; links: VisualLinks }> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  const links = prepareAndBindVisualModel(root);
  return { root, links };
}
