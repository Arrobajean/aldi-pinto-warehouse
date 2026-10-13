import * as THREE from 'three';
import type { Rect, WarehouseLayout } from '@/lib/layout/types';
import { box, lambert, plane } from '@/three/builders/utils';
import { concreteFloor, paintLine, PAINT_WHITE, YARD_MARK_Y, YARD_SLAB_Y } from '@/three/builders/floor';
import { DOCK_FACE_Z, dockBlocks, dockStairX } from '@/three/builders/build-building';
import { DOCK_PITCH, FACE_V, dockU, faceXZ } from '@/lib/layout/dock-geometry';

const ASPHALT = 0x3a4149;
const GROUND = 0x474a45;

function instanced(geom: THREE.BufferGeometry, material: THREE.Material, count: number) {
  const mesh = new THREE.InstancedMesh(geom, material, count);
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

const asRect = (r: Rect) => ({ x: (r.xMin + r.xMax) / 2, z: (r.zMin + r.zMax) / 2, w: r.xMax - r.xMin, d: r.zMax - r.zMin });

function addAsphaltRect(group: THREE.Group, r: Rect, mat: THREE.Material, y = 0.05) {
  const { x, z, w, d } = asRect(r);
  group.add(plane(w, d, mat, x, y, z));
}

function buildRoads(group: THREE.Group, layout: WarehouseLayout) {
  const rw = layout.roadWidth;
  const roadMat = new THREE.MeshLambertMaterial({ color: ASPHALT });
  const parcel = layout.parcel;

  // Anillo perimetral de 8 m.
  addAsphaltRect(group, { xMin: parcel.xMin, xMax: parcel.xMax, zMin: parcel.zMin, zMax: parcel.zMin + rw }, roadMat);
  addAsphaltRect(group, { xMin: parcel.xMin, xMax: parcel.xMax, zMin: parcel.zMax - rw, zMax: parcel.zMax }, roadMat);
  addAsphaltRect(group, { xMin: parcel.xMin, xMax: parcel.xMin + rw, zMin: parcel.zMin + rw, zMax: parcel.zMax - rw }, roadMat);
  addAsphaltRect(group, { xMin: parcel.xMax - rw, xMax: parcel.xMax, zMin: parcel.zMin + rw, zMax: parcel.zMax - rw }, roadMat);

  // Acceso desde el este: garita → báscula → patio de maniobra.
  addAsphaltRect(group, { xMin: 200, xMax: 210, zMin: 150, zMax: 180 }, roadMat);
  addAsphaltRect(group, { xMin: 150, xMax: 200, zMin: 146, zMax: 180 }, roadMat);

  // Patio de maniobra frente a los muelles.
  // Patio de maniobra: hormigón industrial (no asfalto).
  const yc = asRect(layout.site.yard);
  group.add(concreteFloor(yc.w, yc.d, yc.x, YARD_SLAB_Y, yc.z, 'yard'));
  // Patio este: misma cota que el sur; los rectángulos solo se tocan en z = 80.
  const ye = asRect(layout.site.yardEast);
  group.add(concreteFloor(ye.w, ye.d, ye.x, YARD_SLAB_Y, ye.z, 'yard-east'));
}

function buildMarkings(group: THREE.Group, layout: WarehouseLayout) {
  const yellow = new THREE.MeshLambertMaterial({ color: 0xf5c542 });
  const white = new THREE.MeshLambertMaterial({ color: 0xdfe6ee });

  // Paso peatonal (cebra blanca) desde la escalera de cada bloque de muelles hacia el patio.
  for (const block of dockBlocks(layout.docks)) {
    const su = dockStairX(block);
    for (const du of [-0.45, 0, 0.45]) {
      const a = faceXZ(block.face, su + du, FACE_V[block.face] + 0.2);
      const b = faceXZ(block.face, su + du, FACE_V[block.face] + 6);
      paintLine(group, a.x, a.z, b.x, b.z, PAINT_WHITE, 0.35, YARD_MARK_Y);
    }
  }

  // Calle blanca entre muelles contiguos del mismo bloque: una línea por hueco entre remolques.
  for (const face of ['south', 'east'] as const) {
    const us = layout.docks
      .filter((d) => d.face === face)
      .map((d) => dockU(d))
      .sort((a, b) => a - b);
    for (let i = 1; i < us.length; i++) {
      if (us[i] - us[i - 1] > DOCK_PITCH + 1) continue;
      const um = (us[i] + us[i - 1]) / 2;
      const a = faceXZ(face, um, FACE_V[face] + 0.2);
      const b = faceXZ(face, um, FACE_V[face] + 18);
      paintLine(group, a.x, a.z, b.x, b.z, PAINT_WHITE, 0.15, YARD_MARK_Y);
    }
  }

  // Marcos amarillos de los muelles en el patio.
  const dockMarks: { x: number; z: number; east: boolean }[] = [];
  for (const dock of layout.docks) {
    // Marcas de estacionamiento de camiones en el patio, a partir del borde del andén (z=82,4 en la cara sur).
    for (const dv of [84.5, 89.5, 94.5, 99.5]) {
      const c = faceXZ(dock.face, dockU(dock) - 1.25, FACE_V[dock.face] + (dv - DOCK_FACE_Z));
      dockMarks.push({ x: c.x, z: c.z, east: dock.face === 'east' });
    }
  }
  const dockGeo = new THREE.BoxGeometry(0.12, 0.01, 0.6);
  const dockMesh = instanced(dockGeo, yellow, dockMarks.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qEast = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  dockMarks.forEach((mark, i) => {
    p.set(mark.x, YARD_MARK_Y, mark.z);
    m.compose(p, mark.east ? qEast : q, s);
    dockMesh.setMatrixAt(i, m);
  });
  dockMesh.instanceMatrix.needsUpdate = true;
  group.add(dockMesh);

  // Plazas de aparcamiento de semirremolques (marcas blancas).
  const stallMarks: { x: number; z: number }[] = [];
  for (const stall of layout.site.truckParking.stalls) {
    for (let i = 0; i <= 2; i++) {
      stallMarks.push({ x: stall.x + stall.width, z: stall.z + (i / 2) * stall.depth });
    }
  }
  const stallGeo = new THREE.BoxGeometry(0.15, 0.01, 0.6);
  const stallMesh = instanced(stallGeo, white, stallMarks.length);
  stallMarks.forEach((mark, i) => {
    p.set(mark.x, YARD_MARK_Y, mark.z);
    m.compose(p, q, s);
    stallMesh.setMatrixAt(i, m);
  });
  stallMesh.instanceMatrix.needsUpdate = true;
  group.add(stallMesh);
}

function buildBuildingsAndFeatures(group: THREE.Group, layout: WarehouseLayout) {
  const roof = lambert(0x8a95a8);
  const facade = lambert(0xc9d2e0);
  const dark = lambert(0x27303f);

  // Oficinas y vestuarios (2 plantas).
  const o = layout.site.offices;
  const oc = asRect(o);
  const offices = box(oc.w, 7, oc.d, facade, oc.x, 3.5, oc.z);
  group.add(offices);
  const winMat = lambert(0x7c9bc0);
  for (const [wx, wz] of [[0.2, 0.2], [-0.2, 0.25], [0.1, -0.2], [-0.15, -0.1]] as const) {
    const window = box(0.06, 1.6, 1.2, winMat, oc.x + (wx * oc.w) / 2, 4.2, oc.z + (wz * oc.d) / 2);
    group.add(window);
  }

  // Garita y barreras de entrada/salida.
  const booth = box(2.2, 2.4, 2.2, facade, layout.site.guardBooth.x, 1.2, layout.site.guardBooth.z);
  const boothRoof = box(2.4, 0.2, 2.4, roof, layout.site.guardBooth.x, 2.5, layout.site.guardBooth.z);
  group.add(booth, boothRoof);
  for (const bx of [layout.site.guardBooth.x - 3, layout.site.guardBooth.x + 3]) {
    const barrier = box(0.2, 1.0, 3.4, dark, bx, 0.5, layout.site.guardBooth.z + 2.5);
    const barrierTop = box(0.3, 0.2, 3.0, lambert(0xd15555), bx, 1.1, layout.site.guardBooth.z + 2.5);
    group.add(barrier, barrierTop);
  }

  // Báscula.
  const scale = box(18, 0.3, 8, lambert(0x555e6a), layout.site.weighbridge.x, 0.15, layout.site.weighbridge.z);
  group.add(scale);

  // Depósito contra incendios + caseta de bombas.
  const ft = layout.site.fireTank;
  const ftc = asRect(ft);
  group.add(box(ftc.w, 4.2, ftc.d, lambert(0x2e4658), ftc.x, 2.1, ftc.z));
  group.add(box(6, 3, 5, facade, ftc.x, 1.5, ftc.z + ftc.d / 2 + 4));

  // Puntos de recarga eléctrica de camiones.
  for (const c of layout.site.evChargers) {
    const charger = box(0.5, 2.2, 0.5, lambert(0x3a7bd5), c.x, 1.1, c.z);
    const pad = box(2.5, 0.1, 5.5, lambert(0x454d57), c.x, 0.05, c.z);
    group.add(charger, pad);
  }
}

function buildVegetation(group: THREE.Group, layout: WarehouseLayout) {
  const trunkMat = lambert(0x6b4a2f);
  const foliageMat = lambert(0x3c7a3f);
  const { parcel } = layout;
  const rng = seeded(42);
  const spots: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < 46; i++) {
    const x = parcel.xMin + 5 + rng() * (parcel.xMax - parcel.xMin - 10);
    const z = parcel.zMin + 5 + rng() * (parcel.zMax - parcel.zMin - 10);
    // Fuera de edificios, viales y aparcamiento.
    const away =
      Math.abs(x) > 215 || Math.abs(z) > 155
        ? true
        : !(Math.abs(x) < 130 && z > -92 && z < 92) &&
          !(x > -214 && x < -200) &&
          !(z > -140 && z < -135 && x > -135);
    // Nada sobre el hormigón del patio (con 4 m de margen).
    const onYard = [layout.site.yard, layout.site.yardEast].some(
      (r) => x > r.xMin - 4 && x < r.xMax + 4 && z > r.zMin - 4 && z < r.zMax + 4,
    );
    if (away && !onYard) spots.push({ x, z, s: 0.8 + rng() * 1 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6);
  const folGeo = new THREE.ConeGeometry(0.7, 1.6, 6);
  const trunks = instanced(trunkGeo, trunkMat, spots.length);
  const fols = instanced(folGeo, foliageMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  spots.forEach((spot, i) => {
    p.set(spot.x, 0.4 * spot.s, spot.z);
    s.set(spot.s, spot.s, spot.s);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    p.set(spot.x, 1.6 * spot.s, spot.z);
    m.compose(p, q, s);
    fols.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  fols.instanceMatrix.needsUpdate = true;
  group.add(trunks, fols);
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSite(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();

  // Terreno.
  const terrain = plane(
    layout.parcel.xMax - layout.parcel.xMin,
    layout.parcel.zMax - layout.parcel.zMin,
    new THREE.MeshLambertMaterial({ color: GROUND }),
    (layout.parcel.xMin + layout.parcel.xMax) / 2,
    0,
    (layout.parcel.zMin + layout.parcel.zMax) / 2,
  );
  group.add(terrain);

  buildRoads(group, layout);
  buildMarkings(group, layout);
  buildBuildingsAndFeatures(group, layout);
  buildVegetation(group, layout);

  return group;
}