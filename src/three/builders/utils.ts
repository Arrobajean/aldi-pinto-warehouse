import * as THREE from 'three';

export function lambert(color: number | string, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

export function standard(color: number | string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, color, ...opts });
}

export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function plane(w: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, rotX = -Math.PI / 2) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  mesh.rotation.x = rotX;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function group3(): THREE.Group {
  return new THREE.Group();
}