import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import manifest from "../assets/aion-h1s.manifest.json";
import {
  VISUAL_EXPORT,
  VISUAL_LINK_NAMES,
  VISUAL_LINKS,
  VISUAL_MATERIAL_NAMES,
} from "../model/visualContract";
import {
  assertVisualSceneRoots,
  collectMaterialNames,
  prepareAndBindVisualModel,
} from "./visualBinding";

const glbBytes = readFileSync(new URL("../../public/models/aion-h1s.glb", import.meta.url));
let gltf: GLTF;

beforeAll(async () => {
  const data = new Uint8Array(glbBytes).buffer;
  gltf = await new Promise<GLTF>((resolve, reject) => {
    new GLTFLoader().parse(data, "", resolve, reject);
  });
});

describe("Blender visual GLB", () => {
  it("loads the real binary with exact scene roots and materials", () => {
    expect(() => assertVisualSceneRoots(gltf.scene)).not.toThrow();
    expect(gltf.scene.children.map((node) => node.name)).toEqual([...VISUAL_LINK_NAMES]);
    expect(collectMaterialNames(gltf.scene).sort()).toEqual([...VISUAL_MATERIAL_NAMES].sort());
  });

  it("matches the generated manifest and export budgets", () => {
    expect(manifest.nodes).toEqual([...VISUAL_LINK_NAMES]);
    expect(manifest.materials.sort()).toEqual([...VISUAL_MATERIAL_NAMES].sort());
    expect(manifest.exportYup).toBe(VISUAL_EXPORT.gltfYup);
    expect(glbBytes.byteLength).toBe(manifest.bytes);
    expect(glbBytes.byteLength).toBeLessThanOrEqual(VISUAL_EXPORT.maxBytes);
    expect(triangleCount(gltf.scene)).toBe(manifest.triangles);
    expect(manifest.triangles).toBeGreaterThan(0);
    expect(manifest.triangles).toBeLessThanOrEqual(VISUAL_EXPORT.maxTriangles);
  });

  it("keeps every root at its rest origin and every mesh inside its padded hull", () => {
    gltf.scene.updateWorldMatrix(true, true);
    for (const contract of VISUAL_LINKS) {
      const link = gltf.scene.getObjectByName(contract.name);
      expect(link, contract.name).toBeDefined();
      if (!link) continue;
      expect(link.position.toArray(), `${contract.name} rest origin`).toEqual(
        contract.restWorld.map((value) => expect.closeTo(value, 5)),
      );
      const bounds = localBounds(link);
      for (let axis = 0; axis < 3; axis += 1) {
        const allowedMin = contract.hullCenter[axis] - contract.hullHalfExtents[axis] - contract.padding;
        const allowedMax = contract.hullCenter[axis] + contract.hullHalfExtents[axis] + contract.padding;
        expect(bounds.min.getComponent(axis), `${contract.name} minimum axis ${axis}`).toBeGreaterThanOrEqual(allowedMin - 1e-5);
        expect(bounds.max.getComponent(axis), `${contract.name} maximum axis ${axis}`).toBeLessThanOrEqual(allowedMax + 1e-5);
      }
    }
  });

  it("runs the production prepare-and-bind sequence against the real GLB", () => {
    const scene = gltf.scene.clone(true);
    const links = prepareAndBindVisualModel(scene);
    expect(Object.keys(links)).toEqual([...VISUAL_LINK_NAMES]);
    expect(scene.children).toHaveLength(0);
    for (const link of Object.values(links)) {
      link.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        expect(mesh.castShadow).toBe(true);
        expect(mesh.receiveShadow).toBe(true);
      });
    }
  });
});

function triangleCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const position = mesh.geometry.getAttribute("position");
    count += (mesh.geometry.index?.count ?? position.count) / 3;
  });
  return count;
}

function localBounds(root: THREE.Object3D): THREE.Box3 {
  const inverseRoot = root.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const meshBounds = mesh.geometry.boundingBox;
    if (!meshBounds) return;
    bounds.union(meshBounds.clone().applyMatrix4(inverseRoot.clone().multiply(mesh.matrixWorld)));
  });
  return bounds;
}
