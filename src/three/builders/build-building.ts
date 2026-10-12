import * as THREE from 'three';
import type { Rect, WarehouseLayout } from '@/lib/layout/types';
import { box, lambert } from '@/three/builders/utils';
import {
  concreteFloor,
  concreteMaterial,
  paintArrow,
  paintFill,
  paintLine,
  paintOutline,
  PAINT_WHITE,
  SAFETY_YELLOW,
} from '@/three/builders/floor';

export interface WallMesh {
  mesh: THREE.Mesh;
  /** Altura máxima del muro (con modo 'up'). */
  fullTop: number;
  /** Normal exterior del muro (0,0,±1 o ±1,0,0). */
  normal: { x: number; z: number };
}

export interface BuildingModel {
  group: THREE.Group;
  outerWalls: WallMesh[];
  innerWalls: WallMesh[];
}

const WALL_THICKNESS = 0.4;
/** Ancho dibujado de cada calle de pre-carga (los muelles están cada 3,5 m dentro de cada bloque). */
const LANE_DRAW_WIDTH = 2.2;

/** Altura del andén de carga sobre el patio: altura de piso de un camión (remolque). */
export const DOCK_PLATFORM_H = 1.2;
/** Cara exterior de la fachada sur (puertas en z=80) y borde exterior del andén. */
export const DOCK_FACE_Z = 80;
export const DOCK_EDGE_Z = 82.4;
/** Longitud de la rampa interior de la niveladora (de z=79,8 hacia el interior). */
const RAMP_RUN = 5;

function segmentsWithHoles(xMin: number, xMax: number, holes: { xMin: number; xMax: number }[], step = 0.25): { xMin: number; xMax: number }[] {
  const segs: { xMin: number; xMax: number }[] = [];
  let start = xMin;
  for (let x = xMin; x <= xMax + step; x += step) {
    const inside = holes.some((h) => x >= h.xMin && x <= h.xMax);
    if (inside) {
      if (x - start > step) segs.push({ xMin: start, xMax: x });
      start = x + step;
    }
  }
  if (xMax - start > step) segs.push({ xMin: start, xMax: xMax });
  return segs;
}

/** Bloques contiguos de muelles (separados por un hueco de maniobra): una plataforma por bloque. */
export function dockBlocks(docks: { x: number; temp: string }[]): { xMin: number; xMax: number; temp: string }[] {
  const sorted = [...docks].sort((a, b) => a.x - b.x);
  const blocks: { xMin: number; xMax: number; temp: string }[] = [];
  for (const d of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && d.x - last.xMax < 4.5 && last.temp === d.temp) {
      last.xMax = d.x;
    } else {
      blocks.push({ xMin: d.x, xMax: d.x, temp: d.temp });
    }
  }
  return blocks;
}

/** Suelo de la nave: hormigón gris en cada zona, con las marcas de seguridad pintadas encima. */
function buildZoneFloors(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();

  for (const zone of layout.zones) {
    const w = zone.rect.xMax - zone.rect.xMin;
    const d = zone.rect.zMax - zone.rect.zMin;
    const cx = (zone.rect.xMin + zone.rect.xMax) / 2;
    const cz = (zone.rect.zMin + zone.rect.zMax) / 2;
    const floor = concreteFloor(w, d, cx, 0.02, cz, `floor-${zone.id}`);
    floor.userData.zoneId = zone.id;
    floor.userData.zone = zone;
    group.add(floor);
  }

  // Salas de carga y de reposo: contorno y plazas pintadas sobre el hormigón.
  for (const room of layout.rooms) {
    const r = room.rect;
    const edge = room.kind === 'carga' ? SAFETY_YELLOW : PAINT_WHITE;
    paintOutline(group, r.xMin + 0.3, r.xMax - 0.3, r.zMin + 0.3, r.zMax - 0.3, edge, 0.2);
    for (const spot of room.spots) {
      const sw = 2.2;
      const sd = room.kind === 'carga' ? 2.2 : 2.6;
      paintOutline(group, spot.x - sw / 2, spot.x + sw / 2, spot.z - sd / 2, spot.z + sd / 2, edge, 0.1);
      if (room.kind === 'carga') {
        // Cargador: columna con el cable (volumen simple).
        group.add(box(0.9, 1.4, 0.5, lambert(0x2a3550), spot.x, 0.7, spot.z - 0.9));
      }
    }
  }

  // Flejadoras automáticas: cuerpo de la máquina y entrada/salida marcadas.
  for (const st of layout.strappers) {
    const r = st.rect;
    const cx = (r.xMin + r.xMax) / 2;
    const cz = (r.zMin + r.zMax) / 2;
    group.add(box(r.xMax - r.xMin, 1.4, r.zMax - r.zMin, lambert(0x3c4a63), cx, 0.7, cz));
    group.add(box(r.xMax - r.xMin - 1, 0.1, 1.2, lambert(0xf39200), cx, 1.45, cz));
    for (const port of [st.input, st.output]) {
      paintOutline(group, port.x - 1.5, port.x + 1.5, port.z - 1.2, port.z + 1.2, SAFETY_YELLOW, 0.15);
    }
  }

  // Calles de pre-carga: bordes amarillos de seguridad y flecha de sentido hacia la puerta.
  for (const dock of layout.docks) {
    const half = Math.min(LANE_DRAW_WIDTH, dock.laneRect.xMax - dock.laneRect.xMin) / 2;
    const z0 = dock.laneRect.zMin;
    const z1 = dock.laneRect.zMax;
    paintLine(group, dock.x - half, z0, dock.x - half, z1, SAFETY_YELLOW, 0.14);
    paintLine(group, dock.x + half, z0, dock.x + half, z1, SAFETY_YELLOW, 0.14);
    paintArrow(group, dock.x, z0 + 6, 1, PAINT_WHITE, 0.9);
  }

  // Pasillos transversales: bordes amarillos en sus dos lados largos.
  for (const ca of layout.crossAisles) {
    paintLine(group, ca.xMin, ca.zMin + 0.2, ca.xMax, ca.zMin + 0.2, SAFETY_YELLOW, 0.14);
    paintLine(group, ca.xMin, ca.zMax - 0.2, ca.xMax, ca.zMax - 0.2, SAFETY_YELLOW, 0.14);
  }

  // Pasillos de rack: líneas amarillas a ambos lados de cada pasillo, en los tramos de estantería.
  for (const aisle of layout.aisles) {
    const bSide = layout.rackLines.filter((rl) => rl.aisleId === aisle.id && rl.side === 'B');
    for (const rl of bSide) {
      for (const seg of rl.segments) {
        for (const xEdge of [aisle.xCenter - 1.6, aisle.xCenter + 1.6]) {
          paintLine(group, xEdge, seg.zStart, xEdge, seg.zEnd, SAFETY_YELLOW, 0.12);
        }
      }
    }
  }

  return group;
}

function verticalSegments(_width: number, from: number, to: number, wallFull: number, mat: THREE.Material, holes: { xMin: number; xMax: number }[]): WallMesh[] {
  const walls: WallMesh[] = [];
  for (const seg of segmentsWithHoles(from, to, holes)) {
    const cx = (seg.xMin + seg.xMax) / 2;
    const w = seg.xMax - seg.xMin;
    const mesh = box(w, 1, WALL_THICKNESS, mat, cx, wallFull / 2, 0);
    walls.push({ mesh, fullTop: wallFull, normal: { x: 0, z: 1 } });
  }
  return walls;
}

function horizontalSegments(_depth: number, from: number, to: number, wallFull: number, mat: THREE.Material, holes: { xMin: number; xMax: number }[]): WallMesh[] {
  const walls: WallMesh[] = [];
  for (const seg of segmentsWithHoles(from, to, holes)) {
    const cz = (seg.xMin + seg.xMax) / 2;
    const d = seg.xMax - seg.xMin;
    const mesh = box(WALL_THICKNESS, 1, d, mat, 0, wallFull / 2, cz);
    walls.push({ mesh, fullTop: wallFull, normal: { x: 1, z: 0 } });
  }
  return walls;
}

function buildOuterWalls(layout: WarehouseLayout): WallMesh[] {
  const { rect, freeHeight } = layout.building;
  const mat = lambert(0xdfe6ee);
  const matSouth = lambert(0xd5dce7);
  const walls: WallMesh[] = [];

  // Fachada sur con los huecos de los muelles (la base de cada hueco la tapa el andén).
  const dockHoles = layout.docks.map((d) => ({ xMin: d.x - d.doorWidth / 2, xMax: d.x + d.doorWidth / 2 }));
  const south = horizontalSegments(WALL_THICKNESS, rect.xMin, rect.xMax, freeHeight, matSouth, dockHoles);
  for (const w of south) {
    w.normal = { x: 0, z: 1 };
    w.mesh.position.z = rect.zMax;
  }
  walls.push(...south);

  const north = horizontalSegments(WALL_THICKNESS, rect.xMin, rect.xMax, freeHeight, mat, []);
  for (const w of north) {
    w.normal = { x: 0, z: -1 };
    w.mesh.position.z = rect.zMin;
  }
  walls.push(...north);

  const west = verticalSegments(WALL_THICKNESS, rect.zMin, rect.zMax, freeHeight, mat, []);
  for (const w of west) {
    w.normal = { x: -1, z: 0 };
    w.mesh.position.x = rect.xMin;
  }
  walls.push(...west);

  const east = verticalSegments(WALL_THICKNESS, rect.zMin, rect.zMax, freeHeight, mat, []);
  for (const w of east) {
    w.normal = { x: 1, z: 0 };
    w.mesh.position.x = rect.xMax;
  }
  walls.push(...east);

  return walls;
}

function buildInnerWalls(layout: WarehouseLayout): WallMesh[] {
  const walls: WallMesh[] = [];
  const cameraPanels = lambert(0xc9d4e6);

  // Tabique x=30 (seco | frío / fyV), con puertas hacia fyV y Expedición.
  const w1 = verticalSegments(WALL_THICKNESS, -80, 50, 9.5, cameraPanels, [
    { xMin: -32.5, xMax: -18 },
    { xMin: 45, xMax: 50 },
  ]);
  for (const w of w1) w.mesh.position.x = 30;
  walls.push(...w1);

  // Límite sur de Frío / norte de fyV y Congelado: z=−25.
  const w2 = horizontalSegments(WALL_THICKNESS, 30, 125, 9.5, cameraPanels, [
    { xMin: 30, xMax: 36 },
    { xMin: 66, xMax: 72 },
  ]);
  for (const w of w2) w.mesh.position.z = -25;
  walls.push(...w2);

  // Tabique x=70 (fyV | congelado), con puerta y salida.
  const w3 = verticalSegments(WALL_THICKNESS, -25, 50, 9.5, cameraPanels, [
    { xMin: 0, xMax: 5 },
    { xMin: 47, xMax: 50 },
  ]);
  for (const w of w3) w.mesh.position.x = 70;
  walls.push(...w3);

  // Banda baja z=50 hacia Expedición: pasillos que atraviesan las máquinas.
  const w4 = horizontalSegments(WALL_THICKNESS, -125, 125, 3.0, cameraPanels, layout.docks.map((d) => ({ xMin: d.x - 1.5, xMax: d.x + 1.5 })));
  for (const w of w4) w.mesh.position.z = 50;
  walls.push(...w4);

  return walls;
}

/**
 * Muelles: andén elevado (1,2 m) por bloques, niveladora con rampa interior, marquesinas por puerta,
 * escalones peatonales en un extremo de cada bloque y antesala de frío en las zonas refrigeradas.
 */
function buildDockFurniture(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  const shelterMat = lambert(0x39465a);
  const levelerMat = lambert(0x7a8797);
  const frameMat = lambert(0x27303f);
  const stepMat = concreteMaterial(1.4, 0.4);
  const H = DOCK_PLATFORM_H;

  for (const block of dockBlocks(layout.docks)) {
    const left = block.xMin - 1.9;
    const right = block.xMax + 1.9;
    const w = right - left;
    const cxBlock = (left + right) / 2;
    // Andén macizo desde la fachada (z=79,8, bajo la pared) hasta su borde exterior.
    const zStart = DOCK_FACE_Z - 0.2;
    const depth = DOCK_EDGE_Z - zStart;
    const platform = box(w, H, depth, concreteMaterial(w, depth), cxBlock, H / 2, zStart + depth / 2);
    platform.name = `dock-platform-${block.temp}`;
    group.add(platform);
    // Franja de seguridad amarilla en el canto del andén.
    group.add(paintFill(w, 0.3, SAFETY_YELLOW, cxBlock, DOCK_EDGE_Z - 0.2, H + 0.005));

    // Escalones peatonales en el extremo izquierdo del bloque: bajan 0,3 m por peldaño hacia el patio.
    const stepX = left + 0.7;
    for (let k = 0; k < 4; k++) {
      const top = H - (k + 1) * 0.3;
      group.add(box(1.4, top, 0.4, stepMat, stepX, top / 2, DOCK_EDGE_Z + 0.2 + k * 0.4));
    }
    group.add(paintFill(1.4, 0.05, SAFETY_YELLOW, stepX, DOCK_EDGE_Z + 0.2, H + 0.005));

    // Antesala de frío: volumen translúcido junto a los muelles, con franja de temperatura en el suelo.
    if (block.temp !== 'dry') {
      const tint = block.temp === 'frozen' ? 0x9fd8ff : 0x7cc4f0;
      const zMin = 74;
      const zMax = DOCK_FACE_Z - 0.2;
      const wAnte = w + 2;
      const cz = (zMin + zMax) / 2;
      const vol = new THREE.Mesh(
        new THREE.BoxGeometry(wAnte, 3.2, zMax - zMin),
        new THREE.MeshLambertMaterial({ color: tint, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      vol.position.set(cxBlock, 1.6, cz);
      vol.name = `antesala-${block.temp}`;
      group.add(vol);
      group.add(paintFill(wAnte, 0.5, tint, cxBlock, zMin + 0.4, 0.04));
      group.add(paintFill(wAnte, 0.25, tint, cxBlock, zMax - 0.2, 0.04));
      const panelMat = lambert(0x6fa8d6, { transparent: true, opacity: 0.6 });
      group.add(box(0.15, 3.2, zMax - zMin, panelMat, block.xMin - 1.2, 1.6, cz));
      group.add(box(0.15, 3.2, zMax - zMin, panelMat, block.xMax + 1.2, 1.6, cz));
    }
  }

  for (const dock of layout.docks) {
    const cx = dock.x;
    // Niveladora: rampa metálica interior, desde el andén hasta el suelo de la nave.
    const theta = Math.atan(H / RAMP_RUN);
    const len = Math.hypot(RAMP_RUN, H);
    const rampZ = DOCK_FACE_Z - 0.2 - RAMP_RUN / 2;
    const ramp = box(dock.doorWidth, 0.1, len, levelerMat, cx, H / 2, rampZ);
    ramp.rotation.x = -theta;
    group.add(ramp);

    // Placa de la niveladora sobre el andén (labio que se apoya en la caja del camión).
    group.add(box(dock.doorWidth, 0.05, DOCK_EDGE_Z - DOCK_FACE_Z + 0.2, levelerMat, cx, H + 0.025, (DOCK_EDGE_Z + DOCK_FACE_Z - 0.2) / 2));

    // Marquesina a 4,3 m con dos pilares fuera del ancho del remolque (2,55 m).
    group.add(box(3.2, 0.25, 2.0, shelterMat, cx, 4.45, 81.2));
    group.add(box(0.18, 3.1, 0.18, shelterMat, cx - 1.5, H + 1.55, 82.1));
    group.add(box(0.18, 3.1, 0.18, shelterMat, cx + 1.5, H + 1.55, 82.1));

    // Marco de la puerta.
    group.add(box(3.0, 0.2, 0.2, frameMat, cx, 2.6, 80.1));
    group.add(box(0.2, 2.6, 0.2, frameMat, cx - 1.5, 1.3, 80.1));
    group.add(box(0.2, 2.6, 0.2, frameMat, cx + 1.5, 1.3, 80.1));
  }

  return group;
}

function buildOuterAndInner(layout: WarehouseLayout) {
  return { outer: buildOuterWalls(layout), inner: buildInnerWalls(layout) };
}

export function buildBuilding(layout: WarehouseLayout): BuildingModel {
  const group = new THREE.Group();
  group.add(buildZoneFloors(layout));
  const { outer: outerWalls, inner: innerWalls } = buildOuterAndInner(layout);

  for (const w of outerWalls) group.add(w.mesh);
  for (const w of innerWalls) group.add(w.mesh);

  group.add(buildDockFurniture(layout));

  return { group, outerWalls, innerWalls };
}

export function rectCenter(r: Rect) {
  return { x: (r.xMin + r.xMax) / 2, z: (r.zMin + r.zMax) / 2 };
}
