import type { ZoneId } from '@/lib/types';
import {
  ZONE_SYMBOLS,
  locationId,
  type Aisle,
  type Dock,
  type DockFace,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type LayoutStats,
  type RackLine,
  type RackSlot,
  type Rect,
  type RoomSpot,
  type Strapper,
  type WarehouseRoom,
  type SiteElements,
  type WarehouseLayout,
  type ZoneInfo,
} from '@/lib/layout/types';
import { DOOR_HALF, EAST_CORRIDOR_X, FACE_V, INTERIOR_DEPTH, LANE_DEPTH, dockPoint, faceXZ } from '@/lib/layout/dock-geometry';
// --- Cifras de partida (metros, ajustables) ---
const PARCEL: Rect = { xMin: -210, xMax: 210, zMin: -150, zMax: 185 };
const ROAD_WIDTH = 8;
const BUILDING_WIDTH = 250; // x
const BUILDING_DEPTH = 160; // z
const FREE_HEIGHT = 13;

const RACK_DEPTH = 1.1;
const AISLE_WIDTH = 4.0; // pasillo legible en vista isométrica (antes 3,2 m)
const BACK_GAP = 0.2;
const PITCH = RACK_DEPTH * 2 + BACK_GAP + AISLE_WIDTH; // 5,6 m
const MODULE = 2.7; // frente de módulo: 3 palets de 0,8 m
const SLOT_WIDTH = 0.8;
/** Niveles de estantería unificados (nivel 0 = picking, 1..3 = reserva) y altura de cada nivel. */
export const RACK_LEVELS = 4;
export const LEVEL_HEIGHT = 1.6;

/** RNG determinista con semilla fija (mulberry32). */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RackZoneSpec {
  zoneId: ZoneId;
  storageBegin: number;
  storageEnd: number;
  levels: number;
  /** Tramo de z (m) con estanterías; los pasillos transversales lo parten. */
  zRange: [number, number];
}

/** Final este de las estanterías frío y congelado: deja libre el pasillo de servicio de los muelles este. */
const COLD_RACK_END = 106;

const RACK_ZONES: RackZoneSpec[] = [
  { zoneId: 'seco', storageBegin: -105, storageEnd: 30, levels: RACK_LEVELS, zRange: [-76, 44] },
  { zoneId: 'frio', storageBegin: 30, storageEnd: COLD_RACK_END, levels: RACK_LEVELS, zRange: [-76, -29] },
  { zoneId: 'congelado', storageBegin: 70, storageEnd: COLD_RACK_END, levels: RACK_LEVELS, zRange: [-21, 46] },
];

/** Pasillos transversales de 4 m (z), iguales en todas las zonas: cruzan la nave a la misma altura. */
const CROSS_BANDS: [number, number][] = [
  [-36, -32],
  [4, 8],
];

/**
 * Tramos de estantería de una zona: se parten en los pasillos transversales y los módulos de 2,7 m
 * se anclan al pasillo (el sobrante queda en el extremo de la zona).
 */
function rackSegments(zRange: [number, number]): { zStart: number; zEnd: number; firstModule: number; moduleCount: number }[] {
  const [z0, z1] = zRange;
  const pieces: { a: number; b: number; anchorB: boolean }[] = [];
  let start = z0;
  for (const [a, b] of CROSS_BANDS) {
    if (a < z0 || b > z1) continue;
    pieces.push({ a: start, b: a, anchorB: true });
    start = b;
  }
  pieces.push({ a: start, b: z1, anchorB: false });

  const segments: { zStart: number; zEnd: number; firstModule: number; moduleCount: number }[] = [];
  let firstModule = 1;
  for (const p of pieces) {
    const count = Math.floor((p.b - p.a) / MODULE);
    if (count < 1) continue;
    const len = count * MODULE;
    const zStart = p.anchorB ? p.b - len : p.a;
    segments.push({ zStart, zEnd: zStart + len, firstModule, moduleCount: count });
    firstModule += count;
  }
  return segments;
}


/** Flejadora en el pasillo central, entre el almacén de picking y las calles de muelle. */
const STRAPPERS: Strapper[] = [
  {
    id: 'FLJ-01',
    rect: { xMin: -80, xMax: -60, zMin: 43, zMax: 48 },
    input: { x: -82, z: 45.5 },
    output: { x: -58, z: 45.5 },
    secondsPerPallet: 40,
  },
  {
    id: 'FLJ-02',
    rect: { xMin: 60, xMax: 80, zMin: 43, zMax: 48 },
    input: { x: 58, z: 45.5 },
    output: { x: 82, z: 45.5 },
    secondsPerPallet: 40,
  },
];

/** Salas de carga y de reposo en la franja oeste de la nave (libre de racks). */
function buildRooms(): WarehouseRoom[] {
  const carga: RoomSpot[] = [-122, -119, -116, -113, -110, -107].map((x, i) => ({
    id: `CAR-${String(i + 1).padStart(2, '0')}`,
    kind: 'carga' as const,
    x,
    z: -70,
  }));
  const reposo: RoomSpot[] = [];
  // 6 filas de 7 plazas: 42 máquinas aparcadas (la flota tiene 41).
  for (const z of [-59, -56, -53, -50, -47, -44]) {
    for (const x of [-123, -120.5, -118, -115.5, -113, -110.5, -108]) {
      reposo.push({ id: `REP-${String(reposo.length + 1).padStart(2, '0')}`, kind: 'reposo', x, z });
    }
  }
  return [
    { id: 'sala-carga', kind: 'carga', label: 'Sala de carga', rect: { xMin: -125, xMax: -105, zMin: -80, zMax: -62 }, spots: carga },
    { id: 'sala-reposo', kind: 'reposo', label: 'Sala de máquinas', rect: { xMin: -125, xMax: -105, zMin: -62, zMax: -40 }, spots: reposo },
  ];
}

function zones(): ZoneInfo[] {
  const segs = (rz: RackZoneSpec) => rackSegments(rz.zRange);
  return [
    { id: 'seco', label: 'Seco', color: '#c9ced6', temp: '16–22 ºC', rect: { xMin: -125, xMax: 30, zMin: -80, zMax: 50 }, storage: 'rack', levels: RACK_LEVELS, rackSegments: segs(RACK_ZONES[0]) },
    { id: 'carga_baterias', label: 'Sala de carga', color: '#9aa3b5', temp: '—', rect: { xMin: -125, xMax: -105, zMin: -80, zMax: -62 }, storage: 'none' },
    { id: 'frio', label: 'Frío', color: '#7cc4f0', temp: '+2/+4 ºC', rect: { xMin: 30, xMax: COLD_RACK_END, zMin: -80, zMax: -25 }, storage: 'rack', levels: RACK_LEVELS, rackSegments: segs(RACK_ZONES[1]) },
    { id: 'fyv', label: 'Frutas y verduras', color: '#8fd694', temp: '+6 ºC · 85–90 % HR', rect: { xMin: 30, xMax: 70, zMin: -25, zMax: 50 }, storage: 'floor' },
    { id: 'congelado', label: 'Congelado', color: '#b9e3ff', temp: '−22/−25 ºC', rect: { xMin: 70, xMax: COLD_RACK_END, zMin: -25, zMax: 50 }, storage: 'rack', levels: RACK_LEVELS, rackSegments: segs(RACK_ZONES[2]) },
    { id: 'expedicion', label: 'Expedición', color: '#f5d06b', temp: 'según muelle', rect: { xMin: -125, xMax: 125, zMin: 50, zMax: 80 }, storage: 'staging' },
  ];
}

function buildRackLines(): { aisles: Aisle[]; rackLines: RackLine[]; crossAisles: Rect[] } {
  const aisles: Aisle[] = [];
  const rackLines: RackLine[] = [];
  const crossAisles: Rect[] = [];

  for (const rz of RACK_ZONES) {
    const symbol = ZONE_SYMBOLS[rz.zoneId];
    const span = rz.storageEnd - rz.storageBegin;
    const aisleCount = Math.floor(span / PITCH);
    const segments = rackSegments(rz.zRange);
    for (let i = 0; i < aisleCount; i++) {
      const xStart = rz.storageBegin + i * PITCH;
      const aisleNum = i + 1;
      const aisleId = `${symbol}-${String(aisleNum).padStart(2, '0')}`;
      const aisleCenter = xStart + RACK_DEPTH + AISLE_WIDTH / 2;
      const rackBCenter = xStart + RACK_DEPTH / 2;
      const rackACenter = xStart + RACK_DEPTH + AISLE_WIDTH + RACK_DEPTH / 2;

      aisles.push({ id: aisleId, zoneId: rz.zoneId, xCenter: aisleCenter });

      for (const side of ['B', 'A'] as const) {
        rackLines.push({
          id: `${aisleId}-${side}`,
          aisleId,
          zoneId: rz.zoneId,
          side,
          xCenter: side === 'B' ? rackBCenter : rackACenter,
          depth: RACK_DEPTH,
          levels: rz.levels,
          segments,
        });
      }
    }

    // Pasillos transversales de 4 m, a la misma altura en todas las zonas que cruzan.
    for (const [a, b] of CROSS_BANDS) {
      if (a >= rz.zRange[0] && b <= rz.zRange[1]) {
        crossAisles.push({ xMin: rz.storageBegin, xMax: rz.storageEnd, zMin: a, zMax: b });
      }
    }
  }

  return { aisles, rackLines, crossAisles };
}

/**
 * Muelles en L (60 en total). Tramo sur: 36 secos en 3 bloques de 12 a lo largo de la fachada (z = 80).
 * Tramo este: 24 de frío y congelado en la fachada x = 125, de sur a norte (frío 36-45, congelado 46-59).
 * Los índices y las temperaturas no cambian; solo la geometría.
 */
const DOCK_PITCH = 3.5;
const DOCK_BLOCK_GAP = 6;
const SOUTH_BLOCK_PITCH = 12 * DOCK_PITCH + DOCK_BLOCK_GAP;
const SOUTH_FIRST_U = -26.5;
const EAST_COOL_FIRST_Z = 72;
const EAST_FROZEN_FIRST_Z = 31;

function buildDocks(): Dock[] {
  const docks: Dock[] = [];
  const add = (face: DockFace, temp: Dock['temp'], u: number) => {
    const i = docks.length;
    const c = faceXZ(face, u, FACE_V[face]);
    // Calle de pre-carga: tramo sur entre el spine y la fachada; batería este entre el pasillo de servicio y la puerta.
    const laneRect: Rect =
      face === 'south'
        ? { xMin: u - DOOR_HALF, xMax: u + DOOR_HALF, zMin: 54, zMax: 76 }
        : { xMin: 113, xMax: 124, zMin: u - DOOR_HALF, zMax: u + DOOR_HALF };
    docks.push({
      id: `D${String(i + 1).padStart(2, '0')}`,
      index: i,
      face,
      x: c.x,
      z: c.z,
      kind: i < 14 ? 'inbound' : 'outbound',
      temp,
      doorWidth: 3,
      levelerDepth: 2.5,
      laneRect,
    });
  };
  for (let b = 0; b < 3; b++) {
    for (let j = 0; j < 12; j++) add('south', 'dry', SOUTH_FIRST_U + b * SOUTH_BLOCK_PITCH + j * DOCK_PITCH);
  }
  for (let j = 0; j < 10; j++) add('east', 'cool', EAST_COOL_FIRST_Z - j * DOCK_PITCH);
  for (let k = 0; k < 14; k++) add('east', 'frozen', EAST_FROZEN_FIRST_Z - k * DOCK_PITCH);
  return docks;
}

function buildSite(): SiteElements {
  const truckParking: SiteElements['truckParking'] = { stalls: [] };
  const stallWidth = 4;
  const stallDepth = 17;
  const rows: { z: number; xMin: number; xMax: number }[] = [
    { z: 130, xMin: -70, xMax: 70 },
    { z: 153, xMin: -70, xMax: 70 },
  ];
  for (const row of rows) {
    const count = Math.floor((row.xMax - row.xMin) / stallWidth);
    for (let i = 0; i < count; i++) {
      truckParking.stalls.push({ x: row.xMin + i * stallWidth, z: row.z, width: stallWidth, depth: stallDepth });
    }
  }

  return {
    guardBooth: { x: 185, z: 175 },
    weighbridge: { x: 160, z: 150 },
    offices: { xMin: -175, xMax: -135, zMin: 10, zMax: 60 },
    carPark: { xMin: -205, xMax: -180, zMin: 10, zMax: 80 },
    fireTank: { xMin: -130, xMax: -70, zMin: -148, zMax: -132 },
    truckParking,
    yard: { xMin: -135, xMax: 210, zMin: 80, zMax: 120 },
    evChargers: [
      { x: 185, z: 96 },
      { x: 193, z: 96 },
      { x: 201, z: 96 },
    ],
    gate: { x: 185, z: 175 },
  };
}

// --- Palets en el suelo de FyV (calles, sin estanterías) ---
function buildFloorPallets(): { x: number; z: number }[] {
  const palets: { x: number; z: number }[] = [];
  const xStart = 33;
  const xEnd = 66;
  const zStart = -21;
  const zEnd = 46;
  const colGap = 3;
  const rowGap = 1.4;
  for (let x = xStart; x <= xEnd; x += colGap) {
    for (let z = zStart; z <= zEnd; z += rowGap) {
      palets.push({ x, z });
    }
  }
  return palets;
}

/** Holgura de paso alrededor de cada estantería (m). */
const RACK_CLEARANCE = 0.35;

/** Cajas de las estanterías con la holgura de paso. */
export function rackRects(rackLines: RackLine[]): Rect[] {
  const rects: Rect[] = [];
  for (const line of rackLines) {
    for (const seg of line.segments) {
      rects.push({
        xMin: line.xCenter - line.depth / 2 - RACK_CLEARANCE,
        xMax: line.xCenter + line.depth / 2 + RACK_CLEARANCE,
        zMin: seg.zStart,
        zMax: seg.zEnd,
      });
    }
  }
  return rects;
}

/** true si el tramo recto entre a y b no entra en ninguna caja (muestreo cada 0,2 m). */
export function segmentClear(ax: number, az: number, bx: number, bz: number, rects: Rect[]): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const r of rects) {
      if (x > r.xMin && x < r.xMax && z >= r.zMin && z <= r.zMax) return false;
    }
  }
  return true;
}

function buildIndoorGraph(rackLines: RackLine[], crossAisles: Rect[], docks: Dock[], rooms: WarehouseRoom[], aisles: Aisle[]): Graph {
  // Los nodos van en el centro del pasillo, nunca en el eje de una estantería.
  const aisleX = new Map(aisles.map((a) => [a.id, a.xCenter]));
  const rects = rackRects(rackLines);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIndex = new Map<string, number>();

  const addNode = (id: string, x: number, z: number) => {
    if (nodeIndex.has(id)) return;
    nodeIndex.set(id, nodes.length);
    nodes.push({ id, x, z });
  };
  // Solo se añade la arista si el tramo recto no corta ninguna estantería.
  const addEdge = (from: string, to: string) => {
    const a = nodeIndex.get(from);
    const b = nodeIndex.get(to);
    if (a === undefined || b === undefined) return;
    if (!segmentClear(nodes[a].x, nodes[a].z, nodes[b].x, nodes[b].z, rects)) return;
    edges.push({ from, to });
    edges.push({ from: to, to: from });
  };
  const spineNode = (x: number) => `spine-${Math.round(x * 100) / 100}`;

  // Pasillos: nodos en cada extremo de segmento y su centro.
  const aisleXZ: { aisleId: string; zoneId: ZoneId; x: number; z: number }[] = [];
  for (const line of rackLines) {
    const key = `${line.zoneId}:${line.aisleId}`;
    if (aisleXZ.some((a) => `${a.zoneId}:${a.aisleId}` === key)) continue;
    const x = aisleX.get(line.aisleId) ?? line.xCenter;
    const head = line.segments[0].zStart;
    const tail = line.segments[line.segments.length - 1].zEnd;
    addNode(`aisle-${line.aisleId}-N`, x, head + 0.5);
    addNode(`aisle-${line.aisleId}-S`, x, tail + 0.5);
    aisleXZ.push({ aisleId: line.aisleId, zoneId: line.zoneId, x, z: (head + tail) / 2 });

    // Nodos en los pasillos transversales que cortan esta columna.
    for (const ca of crossAisles) {
      const cz = (ca.zMin + ca.zMax) / 2;
      // Solo si este pasillo cae dentro del rango x del cruzamiento.
      if (x > ca.xMin && x < ca.xMax) {
        addNode(`aisle-${line.aisleId}-X-${cz}`, x, cz);
        addEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-X-${cz}`);
        addEdge(`aisle-${line.aisleId}-X-${cz}`, `aisle-${line.aisleId}-S`);
      }
    }
    addEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-S`);
    // Calle norte, por encima de la cabecera de los racks.
    addNode(`north-${line.aisleId}`, x, head - 2.5);
    addEdge(`aisle-${line.aisleId}-N`, `north-${line.aisleId}`);
  }

  // Los pasillos de una misma calle se enlazan por sus transversales, y todos por la calle norte.
  for (const ca of crossAisles) {
    const cz = (ca.zMin + ca.zMax) / 2;
    const row = aisleXZ.filter((a) => a.x > ca.xMin && a.x < ca.xMax).sort((p, q) => p.x - q.x);
    for (let i = 0; i < row.length - 1; i++) {
      addEdge(`aisle-${row[i].aisleId}-X-${cz}`, `aisle-${row[i + 1].aisleId}-X-${cz}`);
    }
  }
  const northRow = [...aisleXZ].sort((p, q) => p.x - q.x);
  for (let i = 0; i < northRow.length - 1; i++) {
    addEdge(`north-${northRow[i].aisleId}`, `north-${northRow[i + 1].aisleId}`);
  }

  // Salas de reposo y carga: un nodo por plaza, unidos a un vestíbulo que da a un pasillo.
  // La sala de reposo queda pegada al frente de los racks: su acceso sale por el pasillo transversal del sur.
  const hub = { x: -115, z: -41 };
  const entrance = { x: -112, z: -38 };
  addNode('room-hub', hub.x, hub.z);
  addNode('room-entrance', entrance.x, entrance.z);
  addEdge('room-hub', 'room-entrance');
  let nearest = { id: '', d: Infinity };
  for (const n of nodes) {
    if (!n.id.startsWith('aisle-') || !n.id.includes('-X-')) continue;
    const d = (n.x - entrance.x) ** 2 + (n.z - entrance.z) ** 2;
    if (d < nearest.d && segmentClear(entrance.x, entrance.z, n.x, n.z, rects)) nearest = { id: n.id, d };
  }
  if (nearest.id) addEdge('room-entrance', nearest.id);
  for (const room of rooms) {
    for (const spot of room.spots) {
      addNode(`spot-${spot.id}`, spot.x, spot.z);
      addEdge(`spot-${spot.id}`, 'room-hub');
    }
  }

  // Spine frontal al sur de los racks, que conecta todos los pasillos con Expedición.
  const spineZ = 47;
  const spineXs = new Set<number>();
  for (const a of aisleXZ) spineXs.add(a.x);
  for (const dk of docks) if (dk.face === 'south') spineXs.add(dk.x);
  // Columna del pasillo de servicio este: su nodo de spine une las calles en batería con Expedición.
  spineXs.add(EAST_CORRIDOR_X);
  const sortedXs = [...spineXs].sort((a, b) => a - b);
  for (let i = 0; i < sortedXs.length - 1; i++) {
    const a = spineNode(sortedXs[i]);
    const b = spineNode(sortedXs[i + 1]);
    addNode(a, sortedXs[i], spineZ);
    addNode(b, sortedXs[i + 1], spineZ);
    addEdge(a, b);
  }
  // Cada pasillo engancha al spine de su columna (si el tramo queda libre).
  for (const a of aisleXZ) {
    addEdge(`aisle-${a.aisleId}-S`, spineNode(a.x));
  }

  // Tramo sur: cada calle de muelle engancha al spine de su columna y al frente del muelle.
  const southDocks = docks.filter((d) => d.face === 'south');
  for (const dk of southDocks) {
    const lane = dockPoint(dk, 0, LANE_DEPTH.south.node);
    const front = dockPoint(dk, 0, INTERIOR_DEPTH);
    addNode(`lane-${dk.id}`, lane.x, lane.z);
    addNode(`dock-${dk.id}`, front.x, front.z);
    addEdge(`lane-${dk.id}`, `dock-${dk.id}`);
    addEdge(spineNode(dk.x), `lane-${dk.id}`);
  }
  // Las calles del tramo sur se enlazan entre sí por su fondo.
  const southLanes = [...southDocks].sort((a, b) => a.x - b.x);
  for (let i = 0; i < southLanes.length - 1; i++) {
    addEdge(`lane-${southLanes[i].id}`, `lane-${southLanes[i + 1].id}`);
  }

  // Tramo este: cada calle en batería llega al pasillo de servicio (x = 110), que se enlaza por z con el spine.
  const eastStops: { id: string; z: number }[] = [{ id: spineNode(EAST_CORRIDOR_X), z: spineZ }];
  for (const dk of docks.filter((d) => d.face === 'east')) {
    const lane = dockPoint(dk, 0, LANE_DEPTH.east.node);
    const front = dockPoint(dk, 0, INTERIOR_DEPTH);
    const corr = `ce-${dk.id}`;
    addNode(corr, EAST_CORRIDOR_X, dk.z);
    addNode(`lane-${dk.id}`, lane.x, lane.z);
    addNode(`dock-${dk.id}`, front.x, front.z);
    addEdge(corr, `lane-${dk.id}`);
    addEdge(`lane-${dk.id}`, `dock-${dk.id}`);
    eastStops.push({ id: corr, z: dk.z });
  }
  eastStops.sort((p, q) => p.z - q.z);
  for (let i = 0; i < eastStops.length - 1; i++) {
    addEdge(eastStops[i].id, eastStops[i + 1].id);
  }

  return { nodes, edges };
}

function buildYardGraph(docks: Dock[]): Graph {
  const nodes: GraphNode[] = [
    { id: 'gate', x: 185, z: 175 },
    { id: 'scale', x: 160, z: 150 },
    { id: 'yard-e', x: 150, z: 105 },
    { id: 'yard-c', x: 0, z: 105 },
    { id: 'yard-w', x: -120, z: 105 },
    { id: 'park-e', x: 70, z: 140 },
    { id: 'park-w', x: -70, z: 140 },
    { id: 'exit', x: 205, z: 178 },
  ];
  const edges: GraphEdge[] = [
    { from: 'gate', to: 'scale' },
    { from: 'scale', to: 'yard-e' },
    { from: 'yard-e', to: 'yard-c' },
    { from: 'yard-c', to: 'yard-w' },
    { from: 'yard-e', to: 'park-e' },
    { from: 'yard-w', to: 'park-w' },
    { from: 'park-e', to: 'park-w' },
    { from: 'yard-e', to: 'exit' },
  ];

  for (const dk of docks) {
    // Tramo sur: la maniobra llega desde el patio (z = 95). Tramo este: desde el patio del este (x = 133).
    const p = dk.face === 'south' ? { x: dk.x, z: 95 } : { x: 133, z: dk.z };
    nodes.push({ id: `ydock-${dk.id}`, x: p.x, z: p.z });
    const anchor = dk.face === 'east' ? 'yard-e' : dk.x < -40 ? 'yard-w' : dk.x > 40 ? 'yard-e' : 'yard-c';
    edges.push({ from: `ydock-${dk.id}`, to: anchor });
  }

  return { nodes, edges };
}

export function buildPintoLayout(): WarehouseLayout {
  const rooms = buildRooms();
  const { aisles, rackLines, crossAisles } = buildRackLines();
  const docks = buildDocks();
  const site = buildSite();
  const floorPallets = buildFloorPallets();

  // Recuento de ubicaciones de rack.
  let locations = 0;
  for (const line of rackLines) {
    let modules = 0;
    for (const seg of line.segments) modules += seg.moduleCount;
    locations += modules * 3 * line.levels;
  }
  locations += floorPallets.length;
  const racksFilled = Math.floor(locations * 0.85);

  const stats: LayoutStats = {
    surface: BUILDING_WIDTH * BUILDING_DEPTH,
    locations,
    racksFilled,
    dockCount: docks.length,
    aisleCount: aisles.length,
  };

  return {
    parcel: PARCEL,
    roadWidth: ROAD_WIDTH,
    building: {
      rect: { xMin: -BUILDING_WIDTH / 2, xMax: BUILDING_WIDTH / 2, zMin: -BUILDING_DEPTH / 2, zMax: BUILDING_DEPTH / 2 },
      freeHeight: FREE_HEIGHT,
    },
    zones: zones(),
    aisles,
    rackLines,
    crossAisles,
    docks,
    site,
    rooms,
    strappers: STRAPPERS,
    indoorGraph: buildIndoorGraph(rackLines, crossAisles, docks, rooms, aisles),
    yardGraph: buildYardGraph(docks),
    stats,
  };
}

/** Itera todas las ubicaciones de palet de las estanterías. */
export function forEachRackSlot(layout: WarehouseLayout, cb: (slot: RackSlot) => void): void {
  for (const line of layout.rackLines) {
    const symbol = ZONE_SYMBOLS[line.zoneId];
    const aisleNum = Number(line.aisleId.split('-')[1]);
    for (const seg of line.segments) {
      for (let m = 0; m < seg.moduleCount; m++) {
        const modNum = seg.firstModule + m;
        for (let level = 0; level < line.levels; level++) {
          for (let s = 0; s < 3; s++) {
            const slot = s as 0 | 1 | 2;
            const x = line.xCenter;
            const z = seg.zStart + m * MODULE + 0.475 + slot * SLOT_WIDTH;
            cb({
              locationId: locationId(symbol, aisleNum, modNum, level, slot),
              zoneId: line.zoneId,
              rackLineId: line.id,
              aisleId: line.aisleId,
              module: modNum,
              level,
              slot,
              x,
              y: level * LEVEL_HEIGHT,
              z,
            });
          }
        }
      }
    }
  }
}

/** Palets en el suelo de FyV (sin estanterías). */
export function floorPalets(): { x: number; z: number }[] {
  return buildFloorPallets();
}

/** RNG determinista para la ocupación inicial (~85 %). */
export function seededRandom(seed = 20250301) {
  return mulberry32(seed);
}