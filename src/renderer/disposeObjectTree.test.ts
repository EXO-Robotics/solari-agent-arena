import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { disposeObjectTree } from "./disposeObjectTree";

describe("disposeObjectTree", () => {
  it("releases nested geometries, materials, and textures", () => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const geometry = new THREE.BoxGeometry();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry, material));
    const disposeGeometry = vi.spyOn(geometry, "dispose");
    const disposeMaterial = vi.spyOn(material, "dispose");
    const disposeTexture = vi.spyOn(texture, "dispose");

    disposeObjectTree(group);

    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
    expect(disposeTexture).toHaveBeenCalledOnce();
  });

  it("releases every material in a material array", () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials);
    const spies = materials.map((material) => vi.spyOn(material, "dispose"));

    disposeObjectTree(mesh);

    spies.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
