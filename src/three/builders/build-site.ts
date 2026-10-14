import * as THREE from 'three';
import type { Rect, WarehouseLayout } from '@/lib/layout/types';
import { box, lambert, plane } from '@/three/builders/utils';
import { concreteFloor, paintLine, PAINT_WHITE, YARD_MARK_Y, YARD_SLAB_Y } from '@/three/builders/floor';
import { DOCK_PITCH, FACE_V, dockU, faceXZ } from '@/lib/layout/dock-geometry';
import { buildProps } from '@/three/builders/build-props';

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

  // Acceso desde el este: entrada (garita → báscula → patio) y salida, separadas 8 m (ver layout.site.access).
  for (const r of layout.site.access) addAsphaltRect(group, r, roadMat);

  // Patio de maniobra frente a los muelles.
  // Patio de maniobra: hormigón industrial (no asfalto).
  const yc = asRect(layout.site.yard);
  group.add(concreteFloor(yc.w, yc.d, yc.x, YARD_SLAB_Y, yc.z, 'yard'));
  // Patio este: misma cota que el sur; los rectángulos solo se tocan en z = 80.
  const ye = asRect(layout.site.yardEast);
  group.add(concreteFloor(ye.w, ye.d, ye.x, YARD_SLAB_Y, ye.z, 'yard-east'));
}

function buildMarkings(group: THREE.Group, layout: WarehouseLayout) {
  const white = new THREE.MeshLambertMaterial({ color: 0xdfe6ee });

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

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();

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

  const winMat = lambert(0x7c9bc0);

  // Garita en la isleta entre el carril de entrada (z = 178) y el de salida (z = 170).
  const gb = layout.site.guardBooth;
  const gt = layout.site.gate;
  group.add(box(2.4, 2.6, 2.4, facade, gb.x, 1.3, gb.z), box(2.8, 0.2, 2.8, roof, gb.x, 2.7, gb.z));
  group.add(box(0.06, 1.2, 1.8, winMat, gb.x + 1.23, 1.4, gb.z)); // ventanal hacia la entrada, que llega desde el este
  // Barreras: pivote en el borde de la isleta y brazo de 3,6 m que cruza su carril, en la línea x = gt.x.
  for (const [pivotZ, dir] of [
    [gt.z + 2.2, 1],
    [gt.z - 2.2, -1],
  ] as const) {
    group.add(box(0.3, 1.1, 0.3, dark, gt.x, 0.55, pivotZ));
    group.add(box(0.14, 0.14, 3.6, lambert(0xd15555), gt.x, 1.05, pivotZ + (dir * 3.6) / 2));
  }
  // Líneas de parada, 2,5 m antes de cada barrera.
  paintLine(group, gt.x + 2.5, gt.z + 2.4, gt.x + 2.5, gt.z + 5.6, PAINT_WHITE, 0.3, YARD_MARK_Y);
  paintLine(group, gt.x - 2.5, gt.z - 5.6, gt.x - 2.5, gt.z - 2.4, PAINT_WHITE, 0.3, YARD_MARK_Y);

  // Báscula en el carril de entrada (z = 150), 20 m de plataforma.
  const scale = box(20, 0.3, 3.6, lambert(0x555e6a), layout.site.weighbridge.x, 0.15, layout.site.weighbridge.z);
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
    // Fuera de la nave (rectángulo real del edificio, con 3 m de margen por los muros), del anillo perimetral oeste
    // y del depósito contra incendios.
    const b = layout.building.rect;
    const inNave = x > b.xMin - 3 && x < b.xMax + 3 && z > b.zMin - 3 && z < b.zMax + 3;
    const onRing = x > parcel.xMin - 4 && x < parcel.xMin + layout.roadWidth + 2;
    const onTank = z > -140 && z < -135 && x > -135;
    const away = Math.abs(x) > 215 || Math.abs(z) > 155 ? true : !inNave && !onRing && !onTank;
    // Nada sobre el hormigón del patio ni sobre la sala anexa de la nave (con 4 m de margen).
    const onYard = [layout.site.yard, layout.site.yardEast, ...layout.site.access, ...(layout.building.annex ? [layout.building.annex] : [])].some(
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

function makeCardinalTexture(name: string, coord: string, arrow: string): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, 1024, 256);
  ctx.fillStyle = 'rgba(11, 22, 44, 0.85)';
  ctx.beginPath();
  ctx.roundRect(16, 16, 1024 - 32, 256 - 32, 36);
  ctx.fill();

  ctx.lineWidth = 8;
  ctx.strokeStyle = '#f39200';
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  ctx.fillStyle = '#f39200';
  ctx.font = 'bold 58px system-ui, sans-serif';
  ctx.fillText(arrow, 120, 128);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 78px system-ui, sans-serif';
  ctx.fillText(name, 512, 105);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(coord, 512, 180);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCardinalPerimeterLabels(group: THREE.Group, layout: WarehouseLayout) {
  const { parcel } = layout;
  const groundY = 0.08;
  const w = 46;
  const d = 11;

  const labels = [
    { name: 'NORTE', coord: 'LÍMITE NORTE · EJE [Z -]', arrow: '▲', x: 0, z: parcel.zMin + 7, rotZ: 0 },
    { name: 'SUR', coord: 'LÍMITE SUR · EJE [Z +]', arrow: '▼', x: 0, z: parcel.zMax - 7, rotZ: 0 },
    { name: 'ESTE', coord: 'LÍMITE ESTE · EJE [X +]', arrow: '►', x: parcel.xMax - 7, z: 0, rotZ: Math.PI / 2 },
    { name: 'OESTE', coord: 'LÍMITE OESTE · EJE [X -]', arrow: '◄', x: parcel.xMin + 7, z: 0, rotZ: -Math.PI / 2 },
  ];

  for (const item of labels) {
    const tex = makeCardinalTexture(item.name, item.coord, item.arrow);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const labelMesh = plane(w, d, mat, item.x, groundY, item.z);
    if (item.rotZ !== 0) {
      labelMesh.rotation.z = item.rotZ;
    }
    labelMesh.renderOrder = 2;
    group.add(labelMesh);
  }
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
  buildCardinalPerimeterLabels(group, layout);
  buildBuildingsAndFeatures(group, layout);
  buildVegetation(group, layout);
  group.add(buildProps(layout));

  return group;
}