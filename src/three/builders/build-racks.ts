import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import { LEVEL_HEIGHT, forEachRackSlot, seededRandom } from '@/lib/layout/pinto-layout';
import { standard } from '@/three/builders/utils';
import { NAVE_FLOOR_H } from '@/three/builders/build-building';
import { PalletBatch } from '@/three/builders/pallets';
import { articleForSku, skuForAisle } from '@/lib/stock/catalog';
import { colorForStock } from '@/lib/stock/colors';
import { PALLET_HEIGHT } from '@/lib/sim/types';

const MODULE = 2.7;

export interface RackPaletMeta {
  locId: string;
  x: number;
  y: number;
  z: number;
  sku: string;
  temp: 'dry' | 'cool' | 'frozen';
  expiryDays: number;
}

export interface RacksModel {
  group: THREE.Group;
  paletMesh: THREE.InstancedMesh;
  /** Lote de palés de estantería (`paletMesh` es su malla de carga). */
  palletBatch: PalletBatch;
  emptyMesh: THREE.InstancedMesh;
  byIndex: RackPaletMeta[];
  byLocId: Map<string, RackPaletMeta>;
  emptyIndex: string[];
}

function instanced(geom: THREE.BufferGeometry, material: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(geom, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

export function buildRacks(layout: WarehouseLayout): RacksModel {
  const group = new THREE.Group();
  // Racks sobre el piso de la nave (1,2 m): las coordenadas de layout son relativas al piso.
  group.position.y = NAVE_FLOOR_H;
  const rng = seededRandom();

  const postMat = standard(0x7d8ca0, { roughness: 0.6, metalness: 0.3 });
  const beamMat = standard(0xf39200, { roughness: 0.55, metalness: 0.2 });

  // --- Puntales ---
  const posts: { x: number; z: number; height: number }[] = [];
  // Los puntales llegan hasta el larguero que sostiene el último nivel (2 × LEVEL_HEIGHT = 3,6 m): el último nivel no lleva columnas.
  for (const line of layout.rackLines) {
    const postHeight = (line.levels - 1) * LEVEL_HEIGHT;
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
        // Largueros donde apoyan los niveles 1 y 2 (1,8 y 3,6 m). El último larguero (3,6 m) es la cabeza de los puntales.
        for (let level = 1; level < line.levels; level++) {
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

  // --- Bancada de base bajo cada tramo de puntales (0,25 m de ancho). Una pieza por tramo, no por puntal:
  // con una placa por puntal serían 2.430 instancias y el presupuesto de la fase 7 es de 2.000 en total.
  const runs = layout.rackLines.flatMap((line) =>
    line.segments.map((seg) => ({ x: line.xCenter, z: seg.zStart, len: seg.moduleCount * MODULE })),
  );
  const plateMesh = instanced(new THREE.BoxGeometry(0.25, 0.03, 1), postMat, runs.length);
  runs.forEach((r, i) => {
    postPos.set(r.x, 0.015, r.z + r.len / 2);
    postScale.set(1, 1, r.len);
    postMatrix.compose(postPos, postQuat, postScale);
    plateMesh.setMatrixAt(i, postMatrix);
  });
  plateMesh.instanceMatrix.needsUpdate = true;
  plateMesh.name = 'post-plates';
  group.add(plateMesh);

  // --- Arriostramiento diagonal en el plano de los puntales: una diagonal cada 4 módulos ---
  const axisX = new THREE.Vector3(1, 0, 0);
  const braces: { x: number; y: number; z: number; len: number; angle: number }[] = [];
  for (const line of layout.rackLines) {
    const y0 = 0.1;
    const y1 = (line.levels - 1) * LEVEL_HEIGHT - 0.15;
    const dy = y1 - y0;
    for (const seg of line.segments) {
      for (let m = 0; m < seg.moduleCount; m += 4) {
        const z0 = seg.zStart + m * MODULE;
        braces.push({ x: line.xCenter, y: (y0 + y1) / 2, z: z0 + MODULE / 2, len: Math.hypot(MODULE, dy), angle: Math.atan2(-dy, MODULE) });
      }
    }
  }
  const braceMesh = instanced(new THREE.BoxGeometry(0.04, 0.04, 1), postMat, braces.length);
  const braceQuat = new THREE.Quaternion();
  braces.forEach((b, i) => {
    postPos.set(b.x, b.y, b.z);
    braceQuat.setFromAxisAngle(axisX, b.angle);
    postScale.set(1, 1, b.len);
    postMatrix.compose(postPos, braceQuat, postScale);
    braceMesh.setMatrixAt(i, postMatrix);
  });
  braceMesh.instanceMatrix.needsUpdate = true;
  braceMesh.name = 'braces';
  group.add(braceMesh);

  // --- Palets y huecos vacíos en una sola pasada (misma semilla) ---
  const palletColor = new THREE.Color();
  // Capacidad = todas las ubicaciones: el ~85 % de ocupación es aleatorio y puede superar racksFilled.
  const palletCapacity = layout.stats.locations;
  const palletBatch = new PalletBatch(palletCapacity, { lod: 'lo' });
  const palletMesh = palletBatch.load;
  const emptyIdxPos: { locId: string; x: number; y: number; z: number }[] = [];
  const byIndex: RackPaletMeta[] = [];
  const byLocId = new Map<string, RackPaletMeta>();

  let palletIndex = 0;
  forEachRackSlot(layout, (slot) => {
    const h = PALLET_HEIGHT;
    if (rng() <= 0.85) {
      const temp: 'dry' | 'cool' | 'frozen' = slot.zoneId === 'frio' ? 'cool' : slot.zoneId === 'congelado' ? 'frozen' : 'dry';
      // El artículo se asigna según el pasillo y familia (slotting logístico ALDI Pinto).
      const sku = skuForAisle(slot.aisleId, slot.zoneId, rng());
      const expiryDays = 5 + Math.floor(rng() * 120);
      palletColor.setHex(colorForStock('occupancy', sku, temp, expiryDays, articleForSku(sku)));
      palletBatch.set(palletIndex, slot.x, slot.y, slot.z, 0, h, palletColor);
      const meta: RackPaletMeta = { locId: slot.locationId, x: slot.x, y: slot.y, z: slot.z, sku, temp, expiryDays };
      byIndex[palletIndex] = meta;
      byLocId.set(slot.locationId, meta);
      palletIndex++;
    } else {
      emptyIdxPos.push({ locId: slot.locationId, x: slot.x, y: slot.y, z: slot.z });
    }
  });
  // Instancias sobrantes (la capacidad supera los palés colocados): ocultas y fuera del dibujo.
  for (let i = palletIndex; i < palletCapacity; i++) palletBatch.hide(i);
  palletBatch.setCount(palletIndex);
  palletBatch.update();
  palletBatch.base.name = 'pallets';
  palletMesh.name = 'pallets';
  group.add(palletBatch.base, palletMesh);
  group.userData.palletMesh = palletMesh;

  // Marcadores de huecos vacíos (nivel 0) para el modo "ubicación vacía".
  const emptyMat = standard(0x2ecc71, { emissive: 0x2ecc71, emissiveIntensity: 0.4, roughness: 0.7 });
  const emptyMesh = instanced(new THREE.BoxGeometry(0.9, 0.06, 0.55), emptyMat, emptyIdxPos.length);
  emptyIdxPos.forEach((e, i) => {
    postPos.set(e.x, e.y + 0.03, e.z);
    postScale.set(1, 1, 1);
    postMatrix.compose(postPos, postQuat, postScale);
    emptyMesh.setMatrixAt(i, postMatrix);
  });
  emptyMesh.instanceMatrix.needsUpdate = true;
  emptyMesh.name = 'empty-slots';
  emptyMesh.visible = false;
  group.add(emptyMesh);
  const emptyIndex = emptyIdxPos.map((e) => e.locId);

  return { group, paletMesh: palletMesh, palletBatch, emptyMesh, byIndex, byLocId, emptyIndex };
}