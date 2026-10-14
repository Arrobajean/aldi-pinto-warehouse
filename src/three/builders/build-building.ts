import * as THREE from 'three';
import type { Dock, DockFace, Rect, WarehouseLayout } from '@/lib/layout/types';
import { DOCK_PITCH, FACE_V, dockU, faceXZ } from '@/lib/layout/dock-geometry';
import { buildPartitions } from '@/lib/layout/pinto-layout';
import { box, lambert, plane } from '@/three/builders/utils';
import {
  concreteFloor,
  concreteMaterial,
  MARK_Y,
  NAVE_LINE_Y,
  NAVE_SLAB_Y,
  NAVE_TINT_Y,
  paintArrow,
  paintFill,
  paintLine,
  paintOutline,
  PAINT_WHITE,
  SAFETY_YELLOW,
} from '@/three/builders/floor';

export interface WallMesh {
  mesh: THREE.Mesh;
  /** Cota superior del muro (con modo 'up'), medida desde el piso de la nave. */
  fullTop: number;
  /** Cota inferior del muro, medida desde el piso de la nave (0 salvo el paño por encima de las puertas). */
  baseY: number;
  /** Normal exterior del muro (0,0,±1 o ±1,0,0). */
  normal: { x: number; z: number };
  /** true si es cerramiento exterior; false para tabiques interiores. */
  outer: boolean;
}

export interface BuildingModel {
  group: THREE.Group;
  outerWalls: WallMesh[];
  innerWalls: WallMesh[];
}

const WALL_THICKNESS = 0.4;
/** Pasillos transversales: franja clara bajo sus bordes amarillos. */
const CROSS_AISLE_TONE = 0xb4bcc6;
/** Franjas de la mancha de andén y del antesala, justo por encima de las marcas de calle. */
const ANTESALA_STRIP_Y = MARK_Y + 0.005;
/** Ancho dibujado de cada calle de pre-carga (los muelles están cada 3,5 m dentro de cada bloque). */
const LANE_DRAW_WIDTH = 2.0;
/** Hueco libre entre el final de las líneas de cada calle de pre-carga y la fachada (m), como en las calles del sur. */
const LANE_PAINT_GAP = 4;

/** Altura del piso único de la nave sobre el patio: igual a la cota de la caja de un remolque (1,2 m). */
export const NAVE_FLOOR_H = 1.2;
/** Cara exterior de la fachada sur (puertas en z=80) y borde exterior de la niveladora (trasera del remolque en z=82,5). */
export const DOCK_FACE_Z = 80;
export const DOCK_EDGE_Z = 82.4;
/** Altura del dintel de las puertas de muelle sobre el piso de la nave (m): por encima se dibuja pared. */
const DOOR_TOP = 2.6;
/** Peldaños de la escalera peatonal: 4 contrahuellas de 0,3 m, huella de 0,5 m. */
const STAIR_RISERS = 4;
const STAIR_RISE = NAVE_FLOOR_H / STAIR_RISERS;
const STAIR_TREAD = 0.5;

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

/** Muro a lo largo de x, en la línea z; `holes` son huecos en x. Va de `y0` a `top` (cotas sobre el piso de la nave). */
function wallAlongX(x0: number, x1: number, z: number, top: number, mat: THREE.Material, holes: Span[], normalZ: number, y0 = 0): WallMesh[] {
  return segmentsWithHoles(x0, x1, holes).map((seg) => ({
    mesh: box(seg.xMax - seg.xMin, top - y0, WALL_THICKNESS, mat, (seg.xMin + seg.xMax) / 2, (top + y0) / 2, z),
    fullTop: top,
    baseY: y0,
    normal: { x: 0, z: normalZ },
    outer: false,
  }));
}

/** Muro a lo largo de z, en la línea x; `holes` son huecos en z. Va de `y0` a `top` (cotas sobre el piso de la nave). */
function wallAlongZ(z0: number, z1: number, x: number, top: number, mat: THREE.Material, holes: Span[], normalX: number, y0 = 0): WallMesh[] {
  return segmentsWithHoles(z0, z1, holes).map((seg) => ({
    mesh: box(WALL_THICKNESS, top - y0, seg.xMax - seg.xMin, mat, x, (top + y0) / 2, (seg.xMin + seg.xMax) / 2),
    fullTop: top,
    baseY: y0,
    normal: { x: normalX, z: 0 },
    outer: false,
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
      if (last && last.face === face && d.u - last.uMax < DOCK_PITCH + 1 && last.temp === d.temp) {
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

  // Una sola base de hormigón opaca para toda la nave: antes cada zona tenía su losa y la de carga se solapaba con la de seco (z-fighting).
  const { rect } = layout.building;
  const baseW = rect.xMax - rect.xMin;
  const baseD = rect.zMax - rect.zMin;
  group.add(concreteFloor(baseW, baseD, (rect.xMin + rect.xMax) / 2, NAVE_SLAB_Y, (rect.zMin + rect.zMax) / 2, 'nave-base'));
  // Sala anexa (ampliación al oeste): mismo hormigón y misma cota que la nave.
  const annex = layout.building.annex;
  if (annex) {
    group.add(concreteFloor(annex.xMax - annex.xMin, annex.zMax - annex.zMin, (annex.xMin + annex.xMax) / 2, NAVE_SLAB_Y, (annex.zMin + annex.zMax) / 2, 'nave-annex-base'));
  }
  // Zonas: áreas invisibles (no escriben color ni profundidad) que solo sirven para elegir zona con el ratón.
  for (const zone of layout.zones) {
    const w = zone.rect.xMax - zone.rect.xMin;
    const d = zone.rect.zMax - zone.rect.zMin;
    const cx = (zone.rect.xMin + zone.rect.xMax) / 2;
    const cz = (zone.rect.zMin + zone.rect.zMax) / 2;
    const hit = plane(w, d, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), cx, NAVE_SLAB_Y, cz);
    hit.name = `zona-${zone.id}`;
    hit.userData.zoneId = zone.id;
    hit.userData.zone = zone;
    group.add(hit);
  }

  // Zonas de estantería: contorno de su color para separarlas a simple vista.
  for (const zone of layout.zones) {
    if (zone.storage !== 'rack') continue;
    const r = zone.rect;
    paintOutline(group, r.xMin + 0.25, r.xMax - 0.25, r.zMin + 0.25, r.zMax - 0.25, parseInt(zone.color.slice(1), 16), 0.5, NAVE_LINE_Y);
  }
  // Pasillos transversales: franja más clara entre sus bordes amarillos.
  for (const ca of layout.crossAisles) {
    group.add(paintFill(ca.xMax - ca.xMin, ca.zMax - ca.zMin, CROSS_AISLE_TONE, (ca.xMin + ca.xMax) / 2, (ca.zMin + ca.zMax) / 2, NAVE_TINT_Y));
  }

  // Pasillo de separación/amortiguación entre sala de carga y la antigua sala de máquinas (z = -93..-85)
  group.add(paintFill(20 - 0.6, 8 - 0.4, CROSS_AISLE_TONE, -115, -89, NAVE_TINT_Y));
  paintLine(group, -125 + 0.3, -93, -105 - 0.3, -93, SAFETY_YELLOW, 0.2);

  // Salas de carga y anexa de máquinas: contorno, calles de maniobra y plazas pintadas sobre el hormigón.
  for (const room of layout.rooms) {
    const r = room.rect;
    const edge = room.kind === 'carga' ? SAFETY_YELLOW : PAINT_WHITE;
    paintOutline(group, r.xMin + 0.3, r.xMax - 0.3, r.zMin + 0.3, r.zMax - 0.3, edge, 0.2);
    // Calles de maniobra en tono claro. Por defecto, las dos de la franja oeste (a lo largo de toda la sala);
    // la sala anexa declara las suyas en `room.lanes`.
    if (room.lanes) {
      for (const l of room.lanes) {
        group.add(paintFill(l.xMax - l.xMin, l.zMax - l.zMin, CROSS_AISLE_TONE, (l.xMin + l.xMax) / 2, (l.zMin + l.zMax) / 2, NAVE_TINT_Y));
      }
    } else {
      // Calle Oeste (salida, x = -118.5)
      group.add(paintFill(3.6, r.zMax - r.zMin - 0.6, CROSS_AISLE_TONE, -118.5, (r.zMin + r.zMax) / 2, NAVE_TINT_Y));
      // Calle Este (troncal de entrada, x = -109.5)
      group.add(paintFill(3.6, r.zMax - r.zMin - 0.6, CROSS_AISLE_TONE, -109.5, (r.zMin + r.zMax) / 2, NAVE_TINT_Y));
    }
    for (const spot of room.spots) {
      // Plazas en horizontal y paralelas: fondo 4.0 m en X, ancho 2.2 m en Z
      paintOutline(group, spot.x - 2.0, spot.x + 2.0, spot.z - 1.05, spot.z + 1.05, edge, 0.1);
      if (room.kind === 'carga') {
        // Cargador: columna pegada al fondo oeste de la plaza (contra la pared)
        group.add(box(0.5, 1.4, 0.9, lambert(0x2a3550), spot.x - 1.75, 0.7, spot.z));
      }
    }
  }

  // Antigua sala de máquinas (z −85…−14,5), ya sin plazas: sus dos calles siguen siendo el circuito de sentido único
  // hacia la sala anexa, así que se pintan igual que antes, sin contorno.
  for (const x of [-118.5, -109.5]) group.add(paintFill(3.6, 70.5 - 0.6, CROSS_AISLE_TONE, x, -49.75, NAVE_TINT_Y));

  // Señalización de sentido único en la zona de máquinas y carga:
  // Calle Este (TRUNK_X = -109.5): ENTRADA -> Flechas blancas hacia el Norte (dirZ = -1)
  paintArrow(group, -109.5, -25, -1, PAINT_WHITE, 1.1);
  paintArrow(group, -109.5, -55, -1, PAINT_WHITE, 1.1);
  paintArrow(group, -109.5, -75, -1, PAINT_WHITE, 1.1);
  paintArrow(group, -109.5, -102, -1, PAINT_WHITE, 1.1);

  // Calle Oeste (DRIVE_AISLE_X = -118.5): SALIDA -> Flechas blancas hacia el Sur (dirZ = 1)
  paintArrow(group, -118.5, -102, 1, PAINT_WHITE, 1.1);
  paintArrow(group, -118.5, -75, 1, PAINT_WHITE, 1.1);
  paintArrow(group, -118.5, -55, 1, PAINT_WHITE, 1.1);
  paintArrow(group, -118.5, -25, 1, PAINT_WHITE, 1.1);

  // Flecha transversal de interconexión en el pasillo de separación (z = -89, x: -109.5 -> -118.5)
  const crossArrowG = new THREE.Group();
  paintArrow(crossArrowG, 0, 0, 1, SAFETY_YELLOW, 1.1);
  crossArrowG.position.set(-114, 0, -89);
  crossArrowG.rotation.y = -Math.PI / 2;
  group.add(crossArrowG);

  // Señalización vial de circulación en serpentina en la cámara de Frío:
  const coldAisleDirs: Record<string, 1 | -1> = {
    'F-01': -1, // Sur -> Norte
    'F-02': 1,  // Norte -> Sur
    'F-03': 1,  // Norte -> Sur (hacia nueva puerta sur)
    'F-04': -1, // Sur -> Norte
    'F-05': 1,  // Norte -> Sur
  };
  const aisleMap = new Map(layout.aisles.map((x) => [x.id, x]));
  for (const [aisleId, dir] of Object.entries(coldAisleDirs)) {
    const a = aisleMap.get(aisleId);
    if (!a) continue;
    paintArrow(group, a.xCenter, -95, dir, PAINT_WHITE, 1.1);
    paintArrow(group, a.xCenter, -48, dir, PAINT_WHITE, 1.1);
  }
  // Flecha de salida rápida directa en la explanada sur frente a la nueva puerta F-03 (z = -28):
  const f03Aisle = aisleMap.get('F-03');
  if (f03Aisle) {
    paintArrow(group, f03Aisle.xCenter, -28, 1, SAFETY_YELLOW, 1.3);
  }

  // Calles de pre-carga: bordes amarillos de seguridad y flecha de sentido hacia la puerta.
  for (const dock of layout.docks) {
    const lr = dock.laneRect;
    const across = dock.face === 'south' ? lr.xMax - lr.xMin : lr.zMax - lr.zMin;
    const half = Math.min(LANE_DRAW_WIDTH, across) / 2;
    const u = dockU(dock);
    // Las líneas paran a LANE_PAINT_GAP de la fachada: en el sur coincide con lr.zMax; en el este (frío) antes llegaban a 1 m.
    const v0 = dock.face === 'south' ? lr.zMin : lr.xMin;
    const v1 = FACE_V[dock.face] - LANE_PAINT_GAP;
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

  buildConsolidationFloor(group, layout);

  // Pasillos de rack: líneas amarillas a ambos lados de cada pasillo, pegadas al frente de los palés.
  for (const aisle of layout.aisles) {
    const bSide = layout.rackLines.filter((rl) => rl.aisleId === aisle.id && rl.side === 'B');
    for (const rl of bSide) {
      for (const seg of rl.segments) {
        for (const xEdge of [aisle.xCenter - 2.65, aisle.xCenter + 2.65]) {
          paintLine(group, xEdge, seg.zStart, xEdge, seg.zEnd, SAFETY_YELLOW, 0.12);
        }
      }
    }
  }

  return group;
}

/** Tono de la playa de consolidación de seco (naranja suave, distinto del gris de seco y del amarillo de expedición). */
const CONSOLIDATION_TONE = 0xe9c9a0;
const CONSOLIDATION_EDGE = 0xf39200;

/**
 * Playa de consolidación: solera tintada con contorno, calles pintadas (separadores blancos, número y flecha de
 * avance hacia el fondo, desde donde recoge la transpaleta) y recuadro de entrega (preparador/flejadora).
 */
function buildConsolidationFloor(group: THREE.Group, layout: WarehouseLayout) {
  for (const area of layout.consolidation) {
    const r = area.rect;
    group.add(paintFill(r.xMax - r.xMin - 0.4, r.zMax - r.zMin - 0.4, CONSOLIDATION_TONE, (r.xMin + r.xMax) / 2, (r.zMin + r.zMax) / 2, NAVE_TINT_Y));
    paintOutline(group, r.xMin + 0.2, r.xMax - 0.2, r.zMin + 0.2, r.zMax - 0.2, CONSOLIDATION_EDGE, 0.3, NAVE_LINE_Y);
    for (const lane of area.lanes) {
      const ex = lane.x + lane.dirX * lane.length;
      const ez = lane.z + lane.dirZ * lane.length;
      // Bordes de la calle a ±0,7 m del eje (palé de 0,8 × 1,2 m con holgura), perpendiculares a la dirección.
      const px = -lane.dirZ * 0.7;
      const pz = lane.dirX * 0.7;
      paintLine(group, lane.x + px, lane.z + pz, ex + px, ez + pz, PAINT_WHITE, 0.08);
      paintLine(group, lane.x - px, lane.z - pz, ex - px, ez - pz, PAINT_WHITE, 0.08);
      if (lane.dirX === 0) {
        paintArrow(group, ex - lane.dirZ * 1.2, ez - lane.dirZ * 1.2, lane.dirZ > 0 ? 1 : -1, PAINT_WHITE, 0.6);
      }
    }
    const p = area.dropPoint;
    paintOutline(group, p.x - 1.5, p.x + 1.5, p.z - 1.2, p.z + 1.2, SAFETY_YELLOW, 0.15);
  }
}

/** Hueco de 1,2 m en la fachada al pie de cada escalera peatonal, para que la escalera lleve dentro de la nave. */
function stairDoorHoles(layout: WarehouseLayout, face: DockFace): Span[] {
  return dockBlocks(layout.docks)
    .filter((b) => b.face === face)
    .map((b) => ({ xMin: dockStairX(b) - 0.6, xMax: dockStairX(b) + 0.6 }));
}

function buildOuterWalls(layout: WarehouseLayout): WallMesh[] {
  const { rect, freeHeight } = layout.building;
  const mat = lambert(0xdfe6ee);
  const matSouth = lambert(0xd5dce7);

  // Huecos de las puertas: en la fachada sur (x) y en la este (z). Cada escalera peatonal tiene su puerta al final.
  const southHoles = [
    ...layout.docks
      .filter((d) => d.face === 'south')
      .map((d) => ({ xMin: d.x - d.doorWidth / 2, xMax: d.x + d.doorWidth / 2 })),
    ...stairDoorHoles(layout, 'south'),
  ];
  const eastHoles = [
    ...layout.docks
      .filter((d) => d.face === 'east')
      .map((d) => ({ xMin: d.z - d.doorWidth / 2, xMax: d.z + d.doorWidth / 2 })),
    ...stairDoorHoles(layout, 'east'),
  ];

  // Muro oeste de la nave: con la sala anexa, el tramo que da a ella (z annex.zMin…zMax) deja de ser exterior; es el
  // tabique interior 'annex-e' (con la puerta de 6 m) y lo dibuja `buildInnerWalls`. Aquí quedan los tramos norte y sur.
  const annex = layout.building.annex;
  const westWall = annex
    ? [
        ...wallAlongZ(rect.zMin, annex.zMin, rect.xMin, freeHeight, mat, [], -1),
        ...wallAlongZ(annex.zMax, rect.zMax, rect.xMin, freeHeight, mat, [], -1),
        // Cerramiento propio de la anexa: oeste, norte y sur, a la altura completa de la nave.
        ...wallAlongZ(annex.zMin, annex.zMax, annex.xMin, freeHeight, mat, [], -1),
        ...wallAlongX(annex.xMin, annex.xMax, annex.zMin, freeHeight, mat, [], -1),
        ...wallAlongX(annex.xMin, annex.xMax, annex.zMax, freeHeight, mat, [], 1),
      ]
    : wallAlongZ(rect.zMin, rect.zMax, rect.xMin, freeHeight, mat, [], -1);

  return [
    // Fachadas con muelles: el hueco de cada puerta llega solo hasta el dintel (`DOOR_TOP`); por encima, un paño
    // macizo, para que sobre las compuertas se vea pared y no un vano abierto hasta el techo.
    ...wallAlongX(rect.xMin, rect.xMax, rect.zMax, DOOR_TOP, matSouth, southHoles, 1),
    ...wallAlongX(rect.xMin, rect.xMax, rect.zMax, freeHeight, matSouth, [], 1, DOOR_TOP),
    ...wallAlongX(rect.xMin, rect.xMax, rect.zMin, freeHeight, mat, [], -1),
    ...westWall,
    ...wallAlongZ(rect.zMin, rect.zMax, rect.xMax, DOOR_TOP, mat, eastHoles, 1),
    ...wallAlongZ(rect.zMin, rect.zMax, rect.xMax, freeHeight, mat, [], 1, DOOR_TOP),
  ].map((w) => ({ ...w, outer: true }));
}

/**
 * Tabiques de las cámaras de frío y congelado (`buildPartitions`): cada hueco mide ≥ 7 m y está centrado en una
 * calle del grafo. Seco, el área de flejado y Expedición quedan abiertos (sin la antigua banda baja de z = 50,
 * que dejaba un hueco estrecho por muelle). Incluye también el muro entre la nave y la sala anexa ('annex-e').
 */
function buildInnerWalls(): WallMesh[] {
  const cameraPanels = lambert(0xc9d4e6);
  return buildPartitions().flatMap((p) => {
    const holes = p.holes.map(([a, b]) => ({ xMin: a, xMax: b }));
    const dir = p.normalDir ?? 1;
    return p.along === 'x'
      ? wallAlongX(p.from, p.to, p.at, p.height, cameraPanels, holes, dir)
      : wallAlongZ(p.from, p.to, p.at, p.height, cameraPanels, holes, dir);
  });
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
  // La sala anexa se levanta sobre el mismo zócalo: su piso queda también a 1,2 m.
  const annex = layout.building.annex;
  if (annex) {
    const aw = annex.xMax - annex.xMin;
    const ad = annex.zMax - annex.zMin;
    const annexPlinth = box(aw, H, ad, concreteMaterial(aw, ad), (annex.xMin + annex.xMax) / 2, H / 2, (annex.zMin + annex.zMax) / 2);
    annexPlinth.name = 'nave-annex-plinth';
    group.add(annexPlinth);
  }

  for (const block of dockBlocks(layout.docks)) {
    const face = block.face;
    const fv = FACE_V[face];
    // Escalera peatonal junto al bloque: sube desde el patio hasta el piso de la nave.
    const su = dockStairX(block);
    // Cuatro huellas: la más cercana al muro queda a H (el piso de la nave, a la altura del hueco de la puerta)
    // y la más alejada a 0,3 m; cada bloque va desde el patio hasta su cota.
    for (let k = 0; k < STAIR_RISERS; k++) {
      const top = H - k * STAIR_RISE;
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
      group.add(planeUV(face, block.uMin - 1.9, block.uMax + 1.9, vIn + 0.15, vIn + 0.65, tint, H + ANTESALA_STRIP_Y));
      group.add(planeUV(face, block.uMin - 1.9, block.uMax + 1.9, vOut - 0.5, vOut - 0.25, tint, H + ANTESALA_STRIP_Y));
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

/** Aseos: solera clara, cuatro cubículos al norte y dos lavabos al sur, volumen simple. Sin techo. */
function buildRestrooms(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'aseos';
  const partition = lambert(0xa9b8c9);
  const basin = lambert(0xf2f5f8);
  for (const wc of layout.restrooms) {
    const r = wc.rect;
    group.add(paintFill(r.xMax - r.xMin, r.zMax - r.zMin, 0xc9d6e3, (r.xMin + r.xMax) / 2, (r.zMin + r.zMax) / 2, NAVE_TINT_Y));
    paintOutline(group, r.xMin + 0.2, r.xMax - 0.2, r.zMin + 0.2, r.zMax - 0.2, PAINT_WHITE, 0.2);
    for (let i = 0; i < 4; i++) {
      group.add(box(0.9, 2.0, 1.4, partition, r.xMin + 1.2 + i * 2.2, 1.0, r.zMin + 1.2));
    }
    for (let i = 0; i < 2; i++) {
      group.add(box(1.0, 0.9, 0.5, basin, r.xMin + 2.5 + i * 5, 0.45, r.zMax - 0.6));
    }
  }
  return group;
}

/**
 * Muros de los aseos (3 m, con el hueco de la puerta). Van en innerWalls para que el modo muros los recorte.
 * Cada módulo está pegado a la fachada: el lado que coincide con el muro exterior no lleva muro propio.
 */
function buildRestroomWalls(layout: WarehouseLayout): WallMesh[] {
  const mat = lambert(0xdfe6ee);
  const { rect } = layout.building;
  const out: WallMesh[] = [];
  for (const wc of layout.restrooms) {
    const r = wc.rect;
    const hole = (side: 'n' | 's' | 'e' | 'w'): Span[] =>
      wc.door.side === side ? [{ xMin: wc.door.at - wc.door.width / 2, xMax: wc.door.at + wc.door.width / 2 }] : [];
    const onFacade = { n: r.zMin <= rect.zMin, s: r.zMax >= rect.zMax, w: r.xMin <= rect.xMin, e: r.xMax >= rect.xMax };
    out.push(
      ...(onFacade.n ? [] : wallAlongX(r.xMin, r.xMax, r.zMin, 3.0, mat, hole('n'), -1)),
      ...(onFacade.s ? [] : wallAlongX(r.xMin, r.xMax, r.zMax, 3.0, mat, hole('s'), 1)),
      ...(onFacade.w ? [] : wallAlongZ(r.zMin, r.zMax, r.xMin, 3.0, mat, hole('w'), -1)),
      ...(onFacade.e ? [] : wallAlongZ(r.zMin, r.zMax, r.xMax, 3.0, mat, hole('e'), 1)),
    );
  }
  return out;
}

export function buildBuilding(layout: WarehouseLayout): BuildingModel {
  const group = new THREE.Group();
  // Todo lo de la nave (suelo, marcas, muros) se construye respecto al piso de la nave, a 1,2 m.
  const nave = new THREE.Group();
  nave.name = 'nave';
  nave.position.y = NAVE_FLOOR_H;
  nave.add(buildZoneFloors(layout));
  nave.add(buildRestrooms(layout));
  const outerWalls = buildOuterWalls(layout);
  const innerWalls = [...buildInnerWalls(), ...buildRestroomWalls(layout)];

  for (const w of outerWalls) nave.add(w.mesh);
  for (const w of innerWalls) nave.add(w.mesh);
  group.add(nave);

  group.add(buildDockFurniture(layout));

  return { group, outerWalls, innerWalls };
}

export function rectCenter(r: Rect) {
  return { x: (r.xMin + r.xMax) / 2, z: (r.zMin + r.zMax) / 2 };
}
