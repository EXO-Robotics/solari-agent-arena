import * as THREE from "three";

const rotation = new THREE.Matrix4();

export function applyMuJoCoPose(
  object: THREE.Object3D,
  positions: ArrayLike<number>,
  matrices: ArrayLike<number>,
  index: number,
): void {
  const positionOffset = index * 3;
  const matrixOffset = index * 9;
  object.position.set(
    positions[positionOffset] ?? 0,
    positions[positionOffset + 1] ?? 0,
    positions[positionOffset + 2] ?? 0,
  );
  rotation.set(
    matrices[matrixOffset] ?? 1, matrices[matrixOffset + 1] ?? 0, matrices[matrixOffset + 2] ?? 0, 0,
    matrices[matrixOffset + 3] ?? 0, matrices[matrixOffset + 4] ?? 1, matrices[matrixOffset + 5] ?? 0, 0,
    matrices[matrixOffset + 6] ?? 0, matrices[matrixOffset + 7] ?? 0, matrices[matrixOffset + 8] ?? 1, 0,
    0, 0, 0, 1,
  );
  object.quaternion.setFromRotationMatrix(rotation);
}

export function createGeomGeometry(
  type: number,
  size: readonly [number, number, number],
  sphere: number,
  capsule: number,
  cylinder: number,
  ellipsoid: number,
): THREE.BufferGeometry {
  if (type === sphere) {
    return new THREE.SphereGeometry(size[0], 20, 14);
  }
  if (type === capsule) {
    const geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2, 6, 12);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }
  if (type === cylinder) {
    const geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 16);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  }
  if (type === ellipsoid) {
    const geometry = new THREE.SphereGeometry(1, 20, 14);
    geometry.scale(size[0], size[1], size[2]);
    return geometry;
  }
  return new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
}
