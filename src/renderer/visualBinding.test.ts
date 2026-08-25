import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { VISUAL_LINK_NAMES, VISUAL_MATERIAL_NAMES } from "../model/visualContract";
import { createMaterialRegistry } from "./materials";
import { createTemporaryVisualLinks } from "./temporaryVisuals";
import {
  VisualModelError,
  assertVisualSceneRoots,
  bindVisualLinks,
  collectMaterialNames,
} from "./visualBinding";

describe("visual binding", () => {
  it("binds all 13 contract nodes from a temporary hierarchy without fallback", () => {
    const { root } = createTemporaryVisualLinks();
    const nested = new THREE.Group();
    nested.name = "blender-export";
    nested.add(root);
    const links = bindVisualLinks(nested);
    expect(Object.keys(links)).toEqual([...VISUAL_LINK_NAMES]);
    expect(links.pelvis.parent).toBeNull();
    expect(links.torso.parent).toBeNull();
    expect(links.left_foot.position.z).toBeCloseTo(0.07);
  });

  it("rejects a model that is missing a required node", () => {
    const { root, links } = createTemporaryVisualLinks();
    links.head.removeFromParent();
    expect(() => bindVisualLinks(root)).toThrow(VisualModelError);
    expect(() => bindVisualLinks(root)).toThrow(/head/);
  });

  it("rejects duplicate bind nodes", () => {
    const { root } = createTemporaryVisualLinks();
    const clone = new THREE.Group();
    clone.name = "pelvis";
    root.add(clone);
    expect(() => bindVisualLinks(root)).toThrow(/Duplicate visual link node "pelvis"/);
  });

  it("rejects missing, duplicate, or extra scene roots", () => {
    const { root } = createTemporaryVisualLinks();
    expect(() => assertVisualSceneRoots(root)).not.toThrow();
    const extra = new THREE.Group();
    extra.name = "Cube";
    root.add(extra);
    expect(() => assertVisualSceneRoots(root)).toThrow(/unexpected: Cube/);
  });

  it("does not treat debug hulls as a visual material change", () => {
    const { root, links } = createTemporaryVisualLinks();
    const cover = links.torso.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const material = cover.material as THREE.MeshStandardMaterial;
    material.wireframe = false;
    bindVisualLinks(root);
    expect(material.wireframe).toBe(false);
  });

  it("exposes the contracted material registry", () => {
    const registry = createMaterialRegistry();
    expect(Object.keys(registry)).toEqual([...VISUAL_MATERIAL_NAMES]);
    expect(registry.AION_LED.emissive.getHex()).toBe(0x5cffe1);
    expect(registry.AION_Cover.metalness).toBeLessThan(0.1);
    const { root } = createTemporaryVisualLinks();
    expect(collectMaterialNames(root).sort()).toEqual([...VISUAL_MATERIAL_NAMES].sort());
  });
});
