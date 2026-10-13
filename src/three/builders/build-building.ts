import * as THREE from 'three';
import type { Dock, DockFace, Rect, WarehouseLayout } from '@/lib/layout/types';
import { FACE_V, dockU, faceXZ } from '@/lib/layout/dock-geometry';
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

/** Altura del piso único de la nave sobre el patio: igual a la cota de la caja de un remolque (1,2 m). */
export const NAVE_FLOOR_H = 1.2;
/** Cara exterior de la fachada sur (puertas en z=80) y borde exterior de la niveladora (trasera del remolque en z=82,5). */
export const DOCK_FACE_Z = 80;
export const DOCK_EDGE_Z = 82.4;
/** Peldaños de la escalera peatonal: 4 contrahuellas de 0,3 m, huella de 0,5 m. */
const STAIR_RISERS = 4;
const STAIR_RISE = NAVE_FLOOR_H / STAIR_RISERS;
const STAIR_TREAD = 0.5;
/** Pasillo de servicio del tramo este: hueco en los muros que lo cruzan (x entre 106,5 y 113,5). */
const EAST_CORRIDOR_OPEN = { xMin: 106.5, xMax: 113.5 };

interface Span {
  xMin: number;
  xMax: number;
}

/** Escalera peatonal de un bloque de muelles: a un lado del bloque, fuera del ancho de los remolques. */
export function dockStairX(block: { uMin: number }): number {
  return block.uMin - 2.6;
}

function segmentsWithHoles(xMin: number, xMax: number, holes: Span[], step = 0.25): Span[] {
  const segs: Span[] = [];
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

/** Muro a lo largo de x, en la línea z; `holes` son huecos en x. Altura completa `height` desde el piso de la nave. */
function wallAlongX(x0: number, x1: number, z: number, height: number, mat: THREE.Material, holes: Span[], normalZ: number): WallMesh[] {
  return segmentsWithHoles(x0, x1, holes).map((seg) => ({
    mesh: box(seg.xMax - seg.xMin, height, WALL_THICKNESS, mat, (seg.xMin + seg.xMax) / 2, height / 2, z),
    fullTop: height,
    normal: { x: 0, z: normalZ },
  }));
}

/** Muro a lo largo de z, en la línea x; `holes` son huecos en z. */
function wallAlongZ(z0: number, z1: number, x: number, height: number, mat: THREE.Material, holes: Span[], normalX: number): WallMesh[] {
  return segmentsWithHoles(z0, z1, holes).map((seg) => ({
    mesh: box(WALL_THICKNESS, height, seg.xMax - seg.xMin, mat, x, height / 2, (seg.xMin + seg.xMax) / 2),
    fullTop: height,
    normal: { x: normalX, z: 0 },
  }));
}

/** Rectángulo en coordenadas de cara: u a lo largo de la fachada, v perpendicular a ella. */
function rectUV(face: DockFace, u0: number, u1: number, v0: number, v1: number) {
  const a = faceXZ(face, u0, v0);
  const b = faceXZ(face, u1, v1);
  return { cx: (a.x + b.x) / 2, cz: (a.z + b.z) / 2, w: Math.abs(b.x - a.x), d: Math.abs(b.z - a.z) };
}

function boxUV(face: DockFace, u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, mat: THREE.Material): THREE.Mesh {
  const r = rectUV(face, u0, u1, v0, v1);
  return box(r.w, y1 - y0, r.d, mat, r.cx, (y0 + y1) / 2, r.cz);
}

function planeUV(face: DockFace, u0: number, u1: number, v0: number, v1: number, color: number, y: number): THREE.Mesh {
  const r = rectUV(face, u0, u1, v0, v1);
  return paintFill(r.w, r.d, color, r.cx, r.cz, y);
}

/** Bloques contiguos de muelles de la misma cara y temperatura (separados por un hueco de maniobra). */
export interface DockBlock {
  face: DockFace;
  /** Extremos de la cara a lo largo de la fachada (x en el sur, z en el este). */
  uMin: number;
  uMax: number;
  temp: string;
}

export function dockBlocks(docks: Pick<Dock, 'face' | 'x' | 'z' | 'temp'>[]): DockBlock[] {
  const blocks: DockBlock[] = [];
  for (const face of ['south', 'east'] as const) {
    const sorted = docks
      .filter((d) => d.face === face)
      .map((d) => ({ u: dockU({ face, x: d.x, z: d.z }), temp: d.temp }))
      .sort((a, b) => a.u - b.u);
    for (const d of sorted) {
      const last = blocks[blocks.length - 1];
      if (last && last.face === face && d.u - last.uMax < 4.5 && last.temp === d.temp) {
        last.uMax = d.u;
      } else {
        blocks.push({ face, uMin: d.u, uMax: d.u, temp: d.temp });
      }
    }
  }
  return blocks;
}

/** Suelo de la nave (origen en el piso de la nave): hormigón gris en cada zona, con las marcas pintadas encima. */
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
    const lr = dock.laneRect;
    const across = dock.face === 'south' ? lr.xMax - lr.xMin : lr.zMax - lr.zMin;
    const half = Math.min(LANE_DRAW_WIDTH, across) / 2;
    const u = dockU(dock);
    const [v0, v1] = dock.face === 'south' ? [lr.zMin, lr.zMax] : [lr.xMin, lr.xMax];
    for (const side of [u - half, u + half]) {
      const a = faceXZ(dock.face, side, v0);
      const b = faceXZ(dock.face, side, v1);
      paintLine(group, a.x, a.z, b.x, b.z, SAFETY_YELLOW, 0.14);
    }
    const arrow = faceXZ(dock.face, u, v0 + 6);
    if (dock.face === 'south') {
      paintArrow(group, arrow.x, arrow.z, 1, PAINT_WHITE, 0.9);
    } else {
      // Batería este: la flecha se gira de +Z a +X, hacia la puerta.
      const g = new THREE.Group();
      paintArrow(g, 0, 0, 1, PAINT_WHITE, 0.9);
      g.position.set(arrow.x, 0, arrow.z);
      g.rotation.y = Math.PI / 2;
      group.add(g);
    }
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

function buildOuterWalls(layout: WarehouseLayout): WallMesh[] {
  const { rect, freeHeight } = layout.building;
  const mat = lambert(0xdfe6ee);
  const matSouth = lambert(0xd5dce7);

  // Huecos de las puertas: en la fachada sur (x) y en la este (z).
  const southHoles = layout.docks
    .filter((d) => d.face === 'south')
    .map((d) => ({ xMin: d.x - d.doorWidth / 2, xMax: d.x + d.doorWidth / 2 }));
  const eastHoles = layout.docks
    .filter((d) => d.face === 'east')
    .map((d) => ({ xMin: d.z - d.doorWidth / 2, xMax: d.z + d.doorWidth / 2 }));

  return [
    ...wallAlongX(rect.xMin, rect.xMax, rect.zMax, freeHeight, matSouth, southHoles, 1),
    ...wallAlongX(rect.xMin, rect.xMax, rect.zMin, freeHeight, mat, [], -1),
    ...wallAlongZ(rect.zMin, rect.zMax, rect.xMin, freeHeight, mat, [], -1),
    ...wallAlongZ(rect.zMin, rect.zMax, rect.xMax, freeHeight, mat, eastHoles, 1),
  ];
}

function buildInnerWalls(layout: WarehouseLayout): WallMesh[] {
  const cameraPanels = lambert(0xc9d4e6);
  const southHoles = layout.docks
    .filter((d) => d.face === 'south')
    .map((d) => ({ xMin: d.x - 1.5, xMax: d.x + 1.5 }));

  return [
    // Tabique x=30 (seco | frío / fyV), con puertas hacia fyV y Expedición.
    ...wallAlongZ(-80, 50, 30, 9.5, cameraPanels, [
      { xMin: -32.5, xMax: -18 },
      { xMin: 45, xMax: 50 },
    ], 1),
    // Límite sur de Frío / norte de fyV y Congelado: z=−25, hasta el pasillo de servicio este.
    ...wallAlongX(30, EAST_CORRIDOR_OPEN.xMin, -25, 9.5, cameraPanels, [
      { xMin: 30, xMax: 36 },
      { xMin: 66, xMax: 72 },
    ], 1),
    // Tabique x=70 (fyV | congelado), con puerta y salida.
    ...wallAlongZ(-25, 50, 70, 9.5, cameraPanels, [
      { xMin: 0, xMax: 5 },
      { xMin: 47, xMax: 50 },
    ], 1),
    // Banda baja z=50 hacia Expedición: pasillos que atraviesan las máquinas y el de servicio este.
    ...wallAlongX(-125, 125, 50, 3.0, cameraPanels, [...southHoles, EAST_CORRIDOR_OPEN], 1),
  ];
}

/**
 * Muelles sobre el piso único de la nave (1,2 m): zócalo bajo la nave, niveladora a ras de piso, marquesinas,
 * escaleras peatonales en el extremo de cada bloque y antesala de frío en los bloques refrigerados.
 * Cada muelle se dibuja en su cara (sur o este) con la misma geometría, rotada.
 */
function buildDockFurniture(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  const shelterMat = lambert(0x39465a);
  const levelerMat = lambert(0x7a8797);
  const frameMat = lambert(0x27303f);
  const stepMat = concreteMaterial(1.4, 0.4);
  const H = NAVE_FLOOR_H;

  // Zócalo de hormigón bajo toda la nave: el piso queda a 1,2 m sobre el patio.
  const { rect } = layout.building;
  const plinthW = rect.xMax - rect.xMin;
  const plinthD = rect.zMax - rect.zMin;
  const plinth = box(plinthW, H, plinthD, concreteMaterial(plinthW, plinthD), (rect.xMin + rect.xMax) / 2, H / 2, (rect.zMin + rect.zMax) / 2);
  plinth.name = 'nave-plinth';
  group.add(plinth);

  for (const block of dockBlocks(layout.docks)) {
    const face = block.face;
    const fv = FACE_V[face];
    // Escalera peatonal junto al bloque: sube desde el patio hasta el piso de la nave.
    const su = dockStairX(block);
    // Tres huellas intermedias: la primera a H-0,3 m y la última a 0,3 m; la última contrahuella llega al patio.
    for (let k = 0; k < STAIR_RISERS - 1; k++) {
      const top = H - (k + 1) * STAIR_RISE;
      const vc = fv + 0.2 + (k + 0.5) * STAIR_TREAD;
      group.add(boxUV(face, su - 0.7, su + 0.7, vc - STAIR_TREAD / 2, vc + STAIR_TREAD / 2, 0, top, stepMat));
    }
    // Antesala de frío: volumen translúcido junto a los muelles, con franja de temperatura en el suelo.
    if (block.temp !== 'dry') {
      const tint = block.temp === 'frozen' ? 0x9fd8ff : 0x7cc4f0;
      const vIn = fv - 6;
      const vOut = fv - 0.2;
      const r = rectUV(face, block.uMin - 1.9, block.uMax + 1.9, vIn, vOut);
      const vol = new THREE.Mesh(
        new THREE.BoxGeometry(r.w, 3.2, r.d),
        new THREE.MeshLambertMaterial({ color: tint, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      vol.position.set(r.cx, H + 1.6, r.cz);
      vol.name = `antesala-${block.temp}`;
      group.add(vol);
      group.add(planeUV(face, block.uMin - 1.9, block.uMax + 1.9, vIn + 0.15, vIn + 0.65, tint, H + 0.04));
      group.add(planeUV(face, block.uMin - 1.9, block.uMax + 1.9, vOut - 0.5, vOut - 0.25, tint, H + 0.04));
      const panelMat = lambert(0x6fa8d6, { transparent: true, opacity: 0.6 });
      group.add(boxUV(face, block.uMin - 1.9 - 0.075, block.uMin - 1.9 + 0.075, vIn, vOut, H, H + 3.2, panelMat));
      group.add(boxUV(face, block.uMax + 1.9 - 0.075, block.uMax + 1.9 + 0.075, vIn, vOut, H, H + 3.2, panelMat));
    }
  }

  for (const dock of layout.docks) {
    const face = dock.face;
    const u = dockU(dock);
    const fv = FACE_V[face];
    // Niveladora: placa a ras de piso desde la fachada hasta la trasera del remolque, con dos apoyos.
    const plateD = DOCK_EDGE_Z - DOCK_FACE_Z + 0.2;
    group.add(boxUV(face, u - dock.doorWidth / 2, u + dock.doorWidth / 2, fv - 0.2, fv - 0.2 + plateD, H - 0.05, H, levelerMat));
    for (const sx of [-1, 1]) {
      const uc = u + (sx * dock.doorWidth) / 2 - sx * 0.2;
      group.add(boxUV(face, uc - 0.125, uc + 0.125, fv + 1.075, fv + 1.325, 0, H - 0.05, frameMat));
    }

    // Marquesina a 4,3 m con dos pilares fuera del ancho del remolque (2,55 m).
    group.add(boxUV(face, u - 1.6, u + 1.6, fv + 0.2, fv + 2.2, 4.325, 4.575, shelterMat));
    group.add(boxUV(face, u - 1.5 - 0.09, u - 1.5 + 0.09, fv + 2.01, fv + 2.19, H, H + 3.1, shelterMat));
    group.add(boxUV(face, u + 1.5 - 0.09, u + 1.5 + 0.09, fv + 2.01, fv + 2.19, H, H + 3.1, shelterMat));

    // Marco de la puerta.
    group.add(boxUV(face, u - 1.5, u + 1.5, fv, fv + 0.2, H + 1.3, H + 1.5, frameMat));
    group.add(boxUV(face, u - 1.5 - 0.1, u - 1.5 + 0.1, fv, fv + 0.2, H, H + 2.6, frameMat));
    group.add(boxUV(face, u + 1.5 - 0.1, u + 1.5 + 0.1, fv, fv + 0.2, H, H + 2.6, frameMat));
  }

  return group;
}

export function buildBuilding(layout: WarehouseLayout): BuildingModel {
  const group = new THREE.Group();
  // Todo lo de la nave (suelo, marcas, muros) se construye respecto al piso de la nave, a 1,2 m.
  const nave = new THREE.Group();
  nave.name = 'nave';
  nave.position.y = NAVE_FLOOR_H;
  nave.add(buildZoneFloors(layout));
  const outerWalls = buildOuterWalls(layout);
  const innerWalls = buildInnerWalls(layout);

  for (const w of outerWalls) nave.add(w.mesh);
  for (const w of innerWalls) nave.add(w.mesh);
  group.add(nave);

  group.add(buildDockFurniture(layout));

  return { group, outerWalls, innerWalls };
}

export function rectCenter(r: Rect) {
  return { x: (r.xMin + r.xMax) / 2, z: (r.zMin + r.zMax) / 2 };
}
