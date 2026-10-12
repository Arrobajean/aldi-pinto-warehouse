import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import { floorPalets, forEachRackSlot, seededRandom } from '@/lib/layout/pinto-layout';
import { standard } from '@/three/builders/utils';

const LEVEL_HEIGHT = 1.6;
const MODULE = 2.7;

/** Paleta de color de familia de producto para la ocupación inicial. */
const FAMILY_COLORS = [
  0xa9875b, // madera (conservas / bazar)
  0xe0a96d, // cartón (seco)
  0xc7b13a, // oil/aceite
  0x7fb4e8, // frío
  0x8fd6ff, // congelado
  0x8fd694, // f&v
  0xb48ad9, // bazar
];

function instanced(geom: THREE.BufferGeometry, material: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(geom, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

export function buildRacks(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  const rng = seededRandom();

  const postMat = standard(0x7d8ca0, { roughness: 0.6, metalness: 0.3 });
  const beamMat = standard(0xf39200, { roughness: 0.55, metalness: 0.2 });
  const palletGeo = new THREE.BoxGeometry(1, 1, 0.8);

  // --- Puntales ---
  const posts: { x: number; z: number; height: number }[] = [];
  for (const line of layout.rackLines) {
    const postHeight = line.levels * LEVEL_HEIGHT + 0.6;
    for (const seg of line.segments) {
      for (let m = 0; m <= seg.moduleCount; m++) {
        const z = seg.zStart + m * MODULE;
        posts.push({ x: line.xCenter, z, height: postHeight });
      }
    }
  }

  const postGeo = new THREE.BoxGeometry(0.09, 1, 0.09);
  const postMesh = instanced(postGeo, postMat, posts.length);
  const postMatrix = new THREE.Matrix4();
  const postQuat = new THREE.Quaternion();
  const postScale = new THREE.Vector3();
  const postPos = new THREE.Vector3();
  posts.forEach((p, i) => {
    postPos.set(p.x, p.height / 2, p.z);
    postScale.set(1, p.height, 1);
    postMatrix.compose(postPos, postQuat, postScale);
    postMesh.setMatrixAt(i, postMatrix);
  });
  postMesh.instanceMatrix.needsUpdate = true;
  postMesh.name = 'posts';
  group.add(postMesh);

  // --- Largueros (naranja) ---
  const beams: { x: number; y: number; z: number; len: number }[] = [];
  for (const line of layout.rackLines) {
    const dx = line.depth / 2 - 0.06;
    for (const seg of line.segments) {
      for (let m = 0; m < seg.moduleCount; m++) {
        const z0 = seg.zStart + m * MODULE;
        for (let level = 1; level <= line.levels; level++) {
          const y = level * LEVEL_HEIGHT;
          beams.push({ x: line.xCenter - dx, y, z: z0, len: MODULE - 0.05 });
          beams.push({ x: line.xCenter + dx, y, z: z0, len: MODULE - 0.05 });
        }
      }
    }
  }

  const beamGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  const beamMesh = instanced(beamGeo, beamMat, beams.length);
  beams.forEach((b, i) => {
    postPos.set(b.x, b.y, b.z + b.len / 2);
    postScale.set(1, 1, b.len);
    postMatrix.compose(postPos, postQuat, postScale);
    beamMesh.setMatrixAt(i, postMatrix);
  });
  beamMesh.instanceMatrix.needsUpdate = true;
  beamMesh.name = 'beams';
  group.add(beamMesh);

  // --- Palets de las estanterías (ocupación ~85 %, color por familia) ---
  const palletMat = standard(0xffffff, { roughness: 0.8, metalness: 0 });
  const palletColor = new THREE.Color();
  const maxPallets = layout.stats.racksFilled;
  const palletMesh = instanced(palletGeo, palletMat, maxPallets);

  let palletIndex = 0;
  forEachRackSlot(layout, (slot) => {
    if (rng() > 0.85) return;
    const h = 1.0 + rng() * 0.5;
    const familyIdx = Math.floor(rng() * FAMILY_COLORS.length);
    postPos.set(slot.x, slot.y + h / 2, slot.z);
    postScale.set(1.2, h, 0.8);
    postMatrix.compose(postPos, postQuat, postScale);
    palletMesh.setMatrixAt(palletIndex, postMatrix);
    palletColor.setHex(FAMILY_COLORS[familyIdx]);
    palletMesh.setColorAt(palletIndex, palletColor);
    palletIndex++;
  });
  palletMesh.instanceMatrix.needsUpdate = true;
  if (palletMesh.instanceColor) palletMesh.instanceColor.needsUpdate = true;
  palletMesh.name = 'pallets';
  group.add(palletMesh);
  group.userData.palletMesh = palletMesh;

  // --- Palets en el suelo de FyV (calles abiertas) ---
  const floor = floorPalets();
  const floorMesh = instanced(palletGeo, palletMat, floor.length);
  const floorColor = new THREE.Color(0x8fd694);
  floor.forEach((f, i) => {
    const h = 1.0 + rng() * 0.4;
    postPos.set(f.x, h / 2, f.z);
    postScale.set(1.2, h, 0.8);
    postMatrix.compose(postPos, postQuat, postScale);
    floorMesh.setMatrixAt(i, postMatrix);
    floorMesh.setColorAt(i, floorColor);
  });
  floorMesh.instanceMatrix.needsUpdate = true;
  if (floorMesh.instanceColor) floorMesh.instanceColor.needsUpdate = true;
  floorMesh.name = 'pallets';
  group.add(floorMesh);

  return group;
}