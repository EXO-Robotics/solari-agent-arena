import * as THREE from "three";
import { VISUAL_LINKS } from "../model/visualContract";
import { createMaterialRegistry } from "./materials";
import type { VisualLinks } from "./visualBinding";

function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function cylinder(
  parent: THREE.Object3D,
  material: THREE.Material,
  radius: number,
  height: number,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): void {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 16), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

export function createTemporaryVisualLinks(): { root: THREE.Group; links: VisualLinks } {
  const materials = createMaterialRegistry();
  const root = new THREE.Group();
  root.name = "aion-h1s-temporary";
  const links = {} as VisualLinks;

  for (const link of VISUAL_LINKS) {
    const node = new THREE.Group();
    node.name = link.name;
    node.position.set(link.restWorld[0], link.restWorld[1], link.restWorld[2]);
    root.add(node);
    links[link.name] = node;
  }

  buildPelvis(links.pelvis, materials);
  buildTorso(links.torso, materials);
  buildHead(links.head, materials);
  buildUpperArm(links.left_upper_arm, materials, 1);
  buildUpperArm(links.right_upper_arm, materials, -1);
  buildForearm(links.left_forearm, materials);
  buildForearm(links.right_forearm, materials);
  buildThigh(links.left_thigh, materials);
  buildThigh(links.right_thigh, materials);
  buildShin(links.left_shin, materials);
  buildShin(links.right_shin, materials);
  buildFoot(links.left_foot, materials);
  buildFoot(links.right_foot, materials);

  return { root, links };
}

function buildPelvis(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  box(node, materials.AION_Anodized, [0.26, 0.3, 0.12], [0, 0, 0]);
  cylinder(node, materials.AION_Aluminum, 0.055, 0.08, [0, 0.145, -0.01], [Math.PI / 2, 0, 0]);
  cylinder(node, materials.AION_Aluminum, 0.055, 0.08, [0, -0.145, -0.01], [Math.PI / 2, 0, 0]);
  box(node, materials.AION_Cover, [0.08, 0.22, 0.04], [0.1, 0, 0.02]);
}

function buildTorso(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  box(node, materials.AION_Cover, [0.28, 0.36, 0.42], [0, 0, 0.2]);
  box(node, materials.AION_Anodized, [0.12, 0.24, 0.2], [0.09, 0, 0.18]);
  box(node, materials.AION_LED, [0.02, 0.1, 0.012], [0.145, 0, 0.34]);
}

function buildHead(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  cylinder(node, materials.AION_Anodized, 0.045, 0.08, [0, 0, 0.02]);
  box(node, materials.AION_Cover, [0.2, 0.18, 0.16], [0, 0, 0.12]);
  box(node, materials.AION_Visor, [0.21, 0.16, 0.05], [0.02, 0, 0.13]);
  box(node, materials.AION_LED, [0.01, 0.08, 0.01], [0.125, 0, 0.13]);
}

function buildUpperArm(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>, side: number): void {
  cylinder(node, materials.AION_Aluminum, 0.048, 0.07, [0, side * 0.02, 0], [Math.PI / 2, 0, 0]);
  cylinder(node, materials.AION_Cover, 0.042, 0.26, [0, 0, -0.14]);
}

function buildForearm(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  cylinder(node, materials.AION_Anodized, 0.036, 0.22, [0, 0, -0.12]);
  box(node, materials.AION_Rubber, [0.07, 0.05, 0.1], [0.01, 0, -0.28]);
}

function buildThigh(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  cylinder(node, materials.AION_Aluminum, 0.06, 0.08, [0, 0, 0], [Math.PI / 2, 0, 0]);
  cylinder(node, materials.AION_Cover, 0.062, 0.3, [0, 0, -0.18]);
}

function buildShin(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  cylinder(node, materials.AION_Aluminum, 0.055, 0.08, [0, 0, 0], [Math.PI / 2, 0, 0]);
  cylinder(node, materials.AION_Anodized, 0.048, 0.3, [0, 0, -0.18]);
}

function buildFoot(node: THREE.Object3D, materials: ReturnType<typeof createMaterialRegistry>): void {
  box(node, materials.AION_Aluminum, [0.22, 0.11, 0.04], [0.06, 0, -0.03]);
  box(node, materials.AION_Rubber, [0.24, 0.12, 0.024], [0.07, 0, -0.058]);
}
