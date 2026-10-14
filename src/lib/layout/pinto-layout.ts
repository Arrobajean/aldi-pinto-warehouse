import type { ZoneId } from '@/lib/types';
import {
  ZONE_SYMBOLS,
  locationId,
  type Aisle,
  type ConsolidationArea,
  type Dock,
  type DockFace,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type LayoutStats,
  type RackLine,
  type RackSlot,
  type Rect,
  type Restroom,
  type RoomSpot,
  type Strapper,
  type WarehouseRoom,
  type SiteElements,
  type WarehouseLayout,
  type ZoneInfo,
} from '@/lib/layout/types';
import { DOCK_PITCH, DOOR_HALF, EAST_CORRIDOR_X, FACE_V, INTERIOR_DEPTH, LANE_DEPTH, dockPoint, faceXZ } from '@/lib/layout/dock-geometry';
// --- Cifras de partida (metros, ajustables) ---
// Parcela hasta x = 260: los camiones entran y salen por el acceso este, que queda dentro del terreno.
const PARCEL: Rect = { xMin: -210, xMax: 260, zMin: -150, zMax: 185 };
const ROAD_WIDTH = 8;
const BUILDING_X_MIN = -125;
const BUILDING_X_MAX = FACE_V.east; // 136 (ampliado para igualar muelles este al resto)
const BUILDING_WIDTH = BUILDING_X_MAX - BUILDING_X_MIN; // 261 (x)
const BUILDING_Z_MIN = -115; // ampliado 35 m al norte aprovechando la parcela libre
const BUILDING_Z_MAX = FACE_V.south; // 80
const BUILDING_DEPTH = BUILDING_Z_MAX - BUILDING_Z_MIN; // 195 (z)
const FREE_HEIGHT = 13;

/**
 * Sala de máquinas anexa: ampliación de la nave hacia el oeste, a la misma cota de piso, con muros a altura completa
 * y sin cubierta. Muros propios al oeste (x = −170), norte (z = −84) y sur (z = −16); al este comparte el muro de la
 * nave (x = −125), que en este tramo es un tabique interior con una puerta de 6 m centrada en el transversal z = −34.
 */
export const ANNEX_RECT: Rect = { xMin: -170, xMax: BUILDING_X_MIN, zMin: -84, zMax: -16 };
export const ANNEX_ROOM_ID = 'sala-anexa';
export const ANNEX_DOOR: [number, number] = [-37, -31];

const RACK_DEPTH = 1.1;
const AISLE_WIDTH = 5.6; // pasillo amplio para cruce de 2 máquinas (carril derecho a 1 m del eje, máquinas de 1,1 m)
const BACK_GAP = 0.2;
const PITCH = RACK_DEPTH * 2 + BACK_GAP + AISLE_WIDTH; // 8,0 m
const MODULE = 2.7; // frente de módulo: 3 palets de 0,8 m
const SLOT_WIDTH = 0.8;
/** Niveles de estantería unificados (nivel 0 = picking, 1..2 = reserva) y altura de cada nivel. */
export const RACK_LEVELS = 3;
export const LEVEL_HEIGHT = 1.8; // palé de 1,6 m + 0,2 m de holgura bajo el larguero; 3 niveles = 5,4 m

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
  /** Eje de la calle de cabecera norte (fila de nodos `north-*`). */
  northStreetZ: number;
  /** Calle interior sur de una cámara cerrada: fila de nodos que une los pasillos y puertas (x) hacia el spine. */
  southStreet?: { z: number; doors: number[] };
  /** Módulos recortados en el extremo sur para ganar playa de maniobra y evitar cuellos de botella. */
  trimSouthModules?: number;
}

/** Ancho útil mínimo de calles, transversales y puertas de cámara: dos carriles + holgura. */
export const STREET_WIDTH = 7;
/** Final este de las estanterías de frío y congelado; tabique este de ambas cámaras hacia el pasillo de servicio. */
const COLD_RACK_END = 106;
export const COLD_WALL_X = 104;
/** Calle norte de seco y frío: 7,5 m entre el muro norte (z = −115) y la cabecera de los racks. */
const RACK_NORTH_Z = BUILDING_Z_MIN + 7.5; // −107,5
const NORTH_STREET_Z = (BUILDING_Z_MIN + RACK_NORTH_Z) / 2; // −111,25
/** Spine / calle de Expedición: banda z 43…50 (7 m), eje en 46,5. Los racks acaban como mucho en z = 43. */
export const SPINE_Z = 46.5;
const SPINE_BAND: [number, number] = [43, 50];
/** Tabique frío | congelado y área de flejado (z = −25); calle norte de congelado hasta la cabecera de sus racks. */
const COLD_SPLIT_Z = -25;
const CONG_RACK_START = COLD_SPLIT_Z + 7.5; // −17,5
const CONG_NORTH_STREET_Z = (COLD_SPLIT_Z + CONG_RACK_START) / 2; // −21,25
/** Frente sur de congelado (tabique z = 43) con calle interior de 7 m y dos puertas de 7,5 m hacia el spine. */
const CONG_FRONT_Z = SPINE_BAND[0];
const CONG_RACK_END = CONG_FRONT_Z - STREET_WIDTH; // 36
const CONG_SOUTH_STREET_Z = (CONG_RACK_END + CONG_FRONT_Z) / 2; // 39,5
const CONG_DOORS_X = [78, 98];
const DOOR_WIDTH = 7.5;

/** Pasillos transversales de 7 m (z), iguales en todas las zonas: cruzan la nave a la misma altura. */
const CROSS_BANDS: [number, number][] = [
  [-75.5, -68.5],
  [-37.5, -30.5],
  [2.5, 9.5],
];

const RACK_ZONES: RackZoneSpec[] = [
  { zoneId: 'seco', storageBegin: -105, storageEnd: 30, levels: RACK_LEVELS, zRange: [RACK_NORTH_Z, SPINE_BAND[0]], northStreetZ: NORTH_STREET_Z },
  // Frío retranqueado 2 módulos (5,4 m): amplia playa de maniobras sur de 17,9 m libres hasta el tabique z = -25.
  { zoneId: 'frio', storageBegin: 30, storageEnd: COLD_RACK_END, levels: RACK_LEVELS, zRange: [RACK_NORTH_Z, CROSS_BANDS[1][1]], northStreetZ: NORTH_STREET_Z, trimSouthModules: 2 },
  {
    zoneId: 'congelado',
    storageBegin: 70,
    storageEnd: COLD_RACK_END,
    levels: RACK_LEVELS,
    zRange: [CONG_RACK_START, CONG_RACK_END],
    northStreetZ: CONG_NORTH_STREET_Z,
    southStreet: { z: CONG_SOUTH_STREET_Z, doors: CONG_DOORS_X },
  },
];

/** Tabique de cámara: recto a lo largo de x (`along: 'x'`, en z = at) o de z (en x = at), con huecos [a, b]. */
export interface Partition {
  id: string;
  along: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  holes: [number, number][];
  height: number;
  /** Dirección del vector normal (1 o -1) en su eje perpendicular, para oclusión y corte de muros (Cutaway). */
  normalDir?: 1 | -1;
}

const doorAt = (center: number, width = DOOR_WIDTH): [number, number] => [center - width / 2, center + width / 2];

/** Eje x del pasillo n (1, 2…) de una zona que empieza en `storageBegin`. */
const aisleAxisX = (storageBegin: number, n: number) => storageBegin + (n - 1) * PITCH + RACK_DEPTH + AISLE_WIDTH / 2;

/**
 * Tabiques de las cámaras de frío y congelado. Cada hueco mide ≥ 7 m y está centrado en una calle del grafo
 * (calle norte, transversales, calles interiores o pasillos del área de flejado): el grafo sale solo por ellos.
 */
export function buildPartitions(): Partition[] {
  const H = 9.5;
  const north: [number, number] = [BUILDING_Z_MIN, RACK_NORTH_Z];
  const congNorth: [number, number] = [COLD_SPLIT_Z, CONG_RACK_START];
  return [
    // Seco | frío (x = 30): cámara de frío a la derecha (+X). Normal hacia Seco (-X = -1)
    { id: 'x30', along: 'z', at: 30, from: BUILDING_Z_MIN, to: COLD_SPLIT_Z, holes: [north, CROSS_BANDS[0], CROSS_BANDS[1]], height: H, normalDir: -1 },
    // Frente sur de frío (z = −25): cámara de frío al norte (-Z). Normal hacia Flejado (+Z = 1)
    {
      id: 'z-25',
      along: 'x',
      at: COLD_SPLIT_Z,
      from: 30,
      to: COLD_WALL_X,
      holes: [doorAt(aisleAxisX(30, 1)), doorAt(aisleAxisX(30, 3), 7.2), doorAt(aisleAxisX(30, 4), PITCH - 0.4), doorAt(aisleAxisX(30, 5), PITCH - 0.4)],
      height: H,
      normalDir: 1,
    },
    // Área de flejado | congelado (x = 70): cámara de congelado a la derecha (+X). Normal hacia Flejado (-X = -1)
    { id: 'x70', along: 'z', at: 70, from: COLD_SPLIT_Z, to: CONG_FRONT_Z, holes: [congNorth, CROSS_BANDS[2]], height: H, normalDir: -1 },
    // Frente sur de congelado hacia el spine (z = 43): congelado al norte (-Z). Normal hacia Expedición (+Z = 1)
    { id: 'z43', along: 'x', at: CONG_FRONT_Z, from: 70, to: COLD_WALL_X, holes: CONG_DOORS_X.map((x) => doorAt(x)), height: H, normalDir: 1 },
    // Tabique este de frío y congelado (x = 104) hacia el pasillo de servicio: cámaras al oeste (-X). Normal hacia pasillo este (+X = 1)
    {
      id: 'x104',
      along: 'z',
      at: COLD_WALL_X,
      from: BUILDING_Z_MIN,
      to: CONG_FRONT_Z,
      holes: [north, CROSS_BANDS[0], CROSS_BANDS[1], congNorth, CROSS_BANDS[2], [CONG_RACK_END, CONG_FRONT_Z]],
      height: H,
      normalDir: 1,
    },
    // Muro oeste de la nave en el tramo de la sala anexa (x = −125): tabique interior de altura completa con la puerta
    // de 6 m de la anexa. Es interior (no `outer`) porque ya no cierra la nave: da a la anexa. Normal hacia la sala (+X).
    { id: 'annex-e', along: 'z', at: ANNEX_RECT.xMax, from: ANNEX_RECT.zMin, to: ANNEX_RECT.zMax, holes: [ANNEX_DOOR], height: FREE_HEIGHT, normalDir: 1 },
  ];
}

/** Cruces del tramo a→b con los tabiques: punto de cruce (coordenada a lo largo del tabique) y hueco usado. */
export function partitionCrossings(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  partitions: Partition[],
): { id: string; u: number; hole: [number, number] | null }[] {
  const out: { id: string; u: number; hole: [number, number] | null }[] = [];
  for (const p of partitions) {
    // Coordenada perpendicular (v) y a lo largo (u) del tabique.
    const [av, bv, au, bu] = p.along === 'x' ? [az, bz, ax, bx] : [ax, bx, az, bz];
    if ((av - p.at) * (bv - p.at) >= 0) continue; // no lo atraviesa (o solo lo toca en un extremo)
    const t = (p.at - av) / (bv - av);
    const u = au + (bu - au) * t;
    if (u < p.from || u > p.to) continue;
    out.push({ id: p.id, u, hole: p.holes.find(([h0, h1]) => u >= h0 && u <= h1) ?? null });
  }
  return out;
}

/** true si el tramo a→b atraviesa un tabique fuera de sus huecos. */
export function crossesPartition(ax: number, az: number, bx: number, bz: number, partitions: Partition[]): boolean {
  return partitionCrossings(ax, az, bx, bz, partitions).some((c) => c.hole === null);
}

/**
 * Tramos de estantería de una zona: se parten en los pasillos transversales y los módulos de 2,7 m
 * se anclan al pasillo (el sobrante queda en el extremo de la zona).
 */
function rackSegments(zRange: [number, number], trimSouthModules = 0): { zStart: number; zEnd: number; firstModule: number; moduleCount: number }[] {
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
  if (trimSouthModules > 0 && segments.length > 0) {
    const last = segments[segments.length - 1];
    const cut = Math.min(trimSouthModules, last.moduleCount - 1);
    last.moduleCount -= cut;
    last.zEnd -= cut * MODULE;
  }
  return segments;
}


/**
 * Antigua zona de FyV en el suelo (x 30…70, z −25…50): sin uso en la simulación, ahora es el área de flejado y
 * consolidación de seco. Los preparadores llegan por el oeste (pasillo x = 33,7, enlazado con el transversal z = 6
 * de seco y con el spine), los trenes flejan de oeste a este y la salida da a la playa de consolidación, al sur.
 */
/** Pasillo N-S de entrada a las flejadoras (eje del pasillo F-01) y pasillo N-S este, junto al congelado. */
const STRAP_WEST_X = aisleAxisX(30, 1); // 33,9 (eje de F-01)
const STRAP_EAST_X = aisleAxisX(30, 5); // 65,9 (eje de F-05)
/** Columna de salida de las flejadoras (output), en el eje de F-04 (puerta central del frente de frío). */
const STRAP_OUT_X = aisleAxisX(30, 4); // 57,9
/** Eje del pasillo transversal z = 4…8 (seco y congelado), prolongado por el área de flejado. */
const STRAP_CROSS_Z = 6;

/** Trenes de flejado: 18 m de vía de rodillos en E-O; entrada 2 m al oeste y salida 2 m al este (contrato de la escena). */
const STRAPPERS: Strapper[] = [
  {
    id: 'FLJ-01',
    rect: { xMin: STRAP_OUT_X - 20, xMax: STRAP_OUT_X - 2, zMin: -15.5, zMax: -12.5 },
    input: { x: STRAP_OUT_X - 22, z: -14 },
    output: { x: STRAP_OUT_X, z: -14 },
    secondsPerPallet: 40,
  },
  {
    id: 'FLJ-02',
    rect: { xMin: STRAP_OUT_X - 20, xMax: STRAP_OUT_X - 2, zMin: -3.5, zMax: -0.5 },
    input: { x: STRAP_OUT_X - 22, z: -2 },
    output: { x: STRAP_OUT_X, z: -2 },
    secondsPerPallet: 40,
  },
];

/** Calles N-S de una playa: `count` calles desde x0 cada `pitch` m, del borde norte (z0) hacia el sur. */
function nsLanes(prefix: string, count: number, x0: number, pitch: number, z0: number, length: number): ConsolidationArea['lanes'] {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${String(i + 1).padStart(2, '0')}`, x: x0 + i * pitch, z: z0, dirX: 0, dirZ: 1, length }));
}

/** Calles E-O de la explanada noreste (al norte de los muelles este), enlazadas con el pasillo de servicio x = 110. */
const NE_STREETS = { north: -103.5, middle: -82.5, south: -62.5 };

/**
 * Playas de consolidación (calles N-S; entrega por el norte y recogida por el sur):
 * - CONS-SECO, junto a la salida de las flejadoras y al spine;
 * - CONS-FRIO y CONS-CONG, en la explanada al norte de los muelles este, entre el pasillo de servicio y la fachada.
 */
function buildConsolidation(): ConsolidationArea[] {
  return [
    {
      id: 'CONS-SECO',
      label: 'Consolidación seco',
      temps: ['dry'],
      rect: { xMin: 36, xMax: 63.5, zMin: 12, zMax: SPINE_BAND[0] },
      lanes: nsLanes('CONS', 11, 37.5, 2.5, 12.8, 29.4),
      dropPoint: { x: STRAP_OUT_X, z: 10.5 },
    },
    {
      id: 'CONS-FRIO',
      label: 'Consolidación frío',
      temps: ['cool'],
      rect: { xMin: 113.8, xMax: 135.2, zMin: -100, zMax: -86 },
      lanes: nsLanes('CF', 10, 115, 2.1, -99.3, 12.6),
      dropPoint: { x: 129, z: NE_STREETS.north },
    },
    {
      id: 'CONS-CONG',
      label: 'Consolidación congelado',
      temps: ['frozen'],
      rect: { xMin: 113.8, xMax: 135.2, zMin: -79, zMax: -66 },
      lanes: nsLanes('CC', 10, 115, 2.1, -78.3, 11.6),
      dropPoint: { x: 119, z: NE_STREETS.middle },
    },
  ];
}

// Salas de carga y de máquinas en la franja oeste (x −125…−105), libre de racks.
export const ROOM_X0 = -125;
export const ROOM_X1 = -105;
export const DRIVE_AISLE_X = -118.5; // calle de maniobra para la columna oeste
export const TRUNK_X = -109.5; // calle troncal para la columna este y paso N-S
export const ROOM_ENTRANCE_Z = -34;

/**
 * Sala anexa: centros x de las cuatro columnas de plazas, calle de acceso (4 m al este de cada columna) y primera z.
 * Columnas y calles de 4 m alternadas (plaza de 4 m de fondo + calle de 4 m): 4 × 19 = 76 plazas, para aparcar aquí
 * toda la flota (41 máquinas) y la plantilla de preparadores (hasta 28 más).
 */
export const ANNEX_COL_X = [-161.5, -153.5, -145.5, -137.5];
export const ANNEX_LANE_X = [-157.5, -149.5, -141.5, -133.5];
export const ANNEX_LANE_W = 4;
const ANNEX_BAYS_PER_COL = 19;
const ANNEX_BAYS_Z0 = -83.6;

/** Plazas en batería horizontal y paralelas, orientadas hacia la pared oeste (-X). */
function horizontalBays(
  zStart: number,
  countPerCol: number,
  pitchZ: number,
  kind: RoomSpot['kind'],
  prefix: string,
  idOffset = 0,
  colX = [-122.5, -114.5],
): RoomSpot[] {
  const spots: RoomSpot[] = [];
  // Columna 1 (oeste, pegada al muro x = -125, centro -122.5) y Columna 2 (este, centro -114.5).
  // Opcionalmente una Columna 3 (centro -106.5) al otro lado de la calle troncal (x = -109.5).
  for (let c = 0; c < colX.length; c++) {
    const x = colX[c];
    const row = c === 0 ? 'w' : 'e';
    for (let i = 0; i < countPerCol; i++) {
      const z = Math.round((zStart + (i + 0.5) * pitchZ) * 10) / 10;
      spots.push({
        id: `${prefix}-${String(idOffset + spots.length + 1).padStart(2, '0')}`,
        kind,
        x,
        z,
        row,
      });
    }
  }
  return spots;
}

function buildRooms(): WarehouseRoom[] {
  // Sala de carga: 2 columnas de 6 = 12 cargadores en paralelo orientados a la pared (z = -115..-93).
  const cargaSpots = horizontalBays(-114, 6, 3.4, 'carga', 'CAR');

  // Sala de máquinas (aparcamiento de la flota): sala anexa al oeste. Es la única con plazas de reposo; la antigua sala
  // de máquinas (x −125…−105, z −85…−14,5) ya no tiene plazas.
  // Cuatro columnas de 19 plazas (paso 2,4 m) desde el muro norte hasta z ≈ −38, por delante de la calle de la puerta
  // (z −36…−32). Como en la nave, la máquina aparca de frente al oeste, así que cada columna se entra desde la calle de
  // su lado este: columna 1 (x −161,5) por la calle 1 (x −157,5), columna 2 (x −153,5) por la calle 2 (x −149,5), y así
  // hasta la columna 4 (x −137,5) por la calle 4 (x −133,5). Calles de 4 m libres; la de acceso a la puerta va por z = −34.
  const annexSpots = horizontalBays(ANNEX_BAYS_Z0, ANNEX_BAYS_PER_COL, 2.4, 'reposo', 'REP', 0, ANNEX_COL_X);
  const annexAisleBand = (x: number): Rect => ({ xMin: x - ANNEX_LANE_W / 2, xMax: x + ANNEX_LANE_W / 2, zMin: ANNEX_RECT.zMin + 0.3, zMax: ROOM_ENTRANCE_Z - ANNEX_LANE_W / 2 });

  return [
    {
      id: 'sala-carga',
      kind: 'carga',
      label: 'Sala de carga',
      rect: { xMin: ROOM_X0, xMax: ROOM_X1, zMin: -115, zMax: -93 },
      spots: cargaSpots,
    },
    {
      id: ANNEX_ROOM_ID,
      kind: 'reposo',
      label: 'Sala de máquinas (anexa)',
      rect: ANNEX_RECT,
      spots: annexSpots,
      lanes: [
        ...ANNEX_LANE_X.map(annexAisleBand),
        // Calle de la puerta: del muro de la nave a la calle 1, centrada en z = −34.
        { xMin: Math.min(...ANNEX_LANE_X) - ANNEX_LANE_W / 2, xMax: ANNEX_RECT.xMax, zMin: ROOM_ENTRANCE_Z - ANNEX_LANE_W / 2, zMax: ROOM_ENTRANCE_Z + ANNEX_LANE_W / 2 },
      ],
    },
  ];
}

function zones(): ZoneInfo[] {
  const segs = (rz: RackZoneSpec) => rackSegments(rz.zRange, rz.trimSouthModules);
  return [
    { id: 'seco', label: 'Seco', color: '#c9ced6', temp: '16–22 ºC', rect: { xMin: -125, xMax: 30, zMin: -115, zMax: 50 }, storage: 'rack', levels: RACK_LEVELS, rackSegments: segs(RACK_ZONES[0]) },
    { id: 'carga_baterias', label: 'Sala de carga', color: '#9aa3b5', temp: '—', rect: { xMin: ROOM_X0, xMax: ROOM_X1, zMin: -115, zMax: -93 }, storage: 'none' },
    { id: 'frio', label: 'Frío', color: '#7cc4f0', temp: '+2/+4 ºC', rect: { xMin: 30, xMax: COLD_WALL_X, zMin: -115, zMax: COLD_SPLIT_Z }, storage: 'rack', levels: RACK_LEVELS, rackSegments: segs(RACK_ZONES[1]) },
    { id: 'congelado', label: 'Congelado', color: '#b9e3ff', temp: '−22/−25 ºC', rect: { xMin: 70, xMax: COLD_WALL_X, zMin: COLD_SPLIT_Z, zMax: CONG_FRONT_Z }, storage: 'rack', levels: RACK_LEVELS, rackSegments: segs(RACK_ZONES[2]) },
    { id: 'expedicion', label: 'Expedición', color: '#f5d06b', temp: 'según muelle', rect: { xMin: -125, xMax: BUILDING_X_MAX, zMin: 50, zMax: 80 }, storage: 'staging' },
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
    const segments = rackSegments(rz.zRange, rz.trimSouthModules);
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
const DOCK_BLOCK_GAP = 8;
const SOUTH_BLOCK_PITCH = 12 * DOCK_PITCH + DOCK_BLOCK_GAP; // 65,6
const SOUTH_FIRST_U = -92; // bloques en −92…−39,2 | −26,4…26,4 | 39,2…92
/** Paso de los muelles este: 5,6 m (calles de pre-carga de 3 m con 2,6 m libres entre ellas). */
const EAST_DOCK_PITCH = 5.6;
const EAST_COOL_FIRST_Z = 74; // frío: 74 … 23,6
const EAST_FROZEN_FIRST_Z = EAST_COOL_FIRST_Z - 9 * EAST_DOCK_PITCH - DOCK_BLOCK_GAP; // congelado: 15,6 … −57,2

function buildDocks(): Dock[] {
  const docks: Dock[] = [];
  const add = (face: DockFace, temp: Dock['temp'], u: number) => {
    const i = docks.length;
    const c = faceXZ(face, u, FACE_V[face]);
    // Calle de pre-carga: tramo sur entre el spine y la fachada; batería este entre el pasillo de servicio y la puerta.
    const laneRect: Rect =
      face === 'south'
        ? { xMin: u - DOOR_HALF, xMax: u + DOOR_HALF, zMin: 54, zMax: 76 }
        : { xMin: FACE_V.east - 23, xMax: FACE_V.east - 1, zMin: u - DOOR_HALF, zMax: u + DOOR_HALF };
    docks.push({
      id: `D${String(i + 1).padStart(2, '0')}`,
      index: i,
      face,
      x: c.x,
      z: c.z,
      // Muelles este de frío (cool) y congelado (frozen): carga y descarga ('mixed'). Los secos del frente sur son
      // de entrada los 14 primeros creados (antes de renumerar) y de salida el resto.
      kind: i < 14 ? 'inbound' : temp === 'frozen' || temp === 'cool' ? 'mixed' : 'outbound',
      temp,
      doorWidth: 3,
      levelerDepth: 2.5,
      laneRect,
    });
  };
  for (let b = 0; b < 3; b++) {
    for (let j = 0; j < 12; j++) add('south', 'dry', SOUTH_FIRST_U + b * SOUTH_BLOCK_PITCH + j * DOCK_PITCH);
  }
  for (let j = 0; j < 10; j++) add('east', 'cool', EAST_COOL_FIRST_Z - j * EAST_DOCK_PITCH);
  for (let k = 0; k < 14; k++) add('east', 'frozen', EAST_FROZEN_FIRST_Z - k * EAST_DOCK_PITCH);
  // Ampliación del frente sur: cuatro muelles secos pegados al oeste del primer bloque (junto al D01 original). Se
  // generan al final para conservar el tipo de los anteriores; el aseo WC-02 queda al oeste del último.
  for (const u of [-111.2, -106.4, -101.6, -96.8]) add('south', 'dry', u);
  // Numeración correlativa: fachada sur de oeste a este y, después, la este de sur a norte. Cada muelle conserva su tipo.
  const south = docks.filter((d) => d.face === 'south').sort((a, b) => a.x - b.x);
  const east = docks.filter((d) => d.face === 'east');
  return [...south, ...east].map((d, i) => ({ ...d, index: i, id: `D${String(i + 1).padStart(2, '0')}` }));
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
    // Garita en la isleta entre el carril de entrada (z = 178) y el de salida (z = 170); barreras en x = 238.
    guardBooth: { x: 236, z: 174 },
    weighbridge: { x: 160, z: 150 },
    fireTank: { xMin: -130, xMax: -70, zMin: -148, zMax: -132 },
    truckParking,
    yard: { xMin: -135, xMax: 210, zMin: 80, zMax: 126 },
    yardEast: { xMin: FACE_V.east, xMax: 190, zMin: -85, zMax: 80 },
    evChargers: [
      { x: 185, z: 96 },
      { x: 193, z: 96 },
      { x: 201, z: 96 },
    ],
    gate: { x: 238, z: 174 },
    access: [
      { xMin: 186, xMax: 205, zMin: 150, zMax: 177 }, // entrada: tramo norte y curva hacia la báscula
      { xMin: 201, xMax: 260, zMin: 176, zMax: 180 }, // entrada: carril z = 178 hasta la barrera
      { xMin: 138, xMax: 205, zMin: 146, zMax: 154 }, // carril de la báscula (z = 150)
      { xMin: 138, xMax: 160, zMin: 126, zMax: 146 }, // distribuidor hacia el patio sur
      { xMin: 203, xMax: 260, zMin: 150, zMax: 177 }, // salida: carril este (z = 170) e isleta de la garita
      { xMin: 203, xMax: 215, zMin: 126, zMax: 150 }, // salida: tramo sur (x = 209)
    ],
  };
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

/**
 * Red del área de flejado y consolidación de seco (antigua FyV), al sur del frente de frío (z = −25):
 * - pasillo oeste x = 33,9 (eje de F-01): calle interior de frío, entradas de las flejadoras, transversal z = 6 y spine;
 * - columna de salidas x = 57,9 (eje de F-04): calle de frío, salidas, transversal z = 6 y punto de entrega de la playa;
 * - pasillo este x = 65,9 (eje de F-05): calle de frío, calle norte de congelado, transversal z = 6 y spine;
 * - transversal z = 6 que une el de seco (x < 30) con el de congelado (x > 70); recogida de la playa al spine.
 */
function addStrapperNetwork(
  nodes: GraphNode[],
  addNode: (id: string, x: number, z: number) => void,
  addEdge: (a: string, b: string) => void,
  spineNode: (x: number) => string,
  strappers: Strapper[],
  consolidation: ConsolidationArea[],
) {
  const chain = (ids: { id: string; k: number }[]) => {
    const sorted = [...ids].sort((p, q) => p.k - q.k);
    for (let i = 0; i < sorted.length - 1; i++) addEdge(sorted[i].id, sorted[i + 1].id);
  };
  const near = (prefix: string, suffix: string, x: number) =>
    nodes.filter((n) => n.id.startsWith(prefix) && n.id.endsWith(suffix)).sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x))[0];
  const wId = (z: number) => `strap-w-${z}`;
  const eId = (z: number) => `strap-e-${z}`;
  const oId = (z: number) => `strap-o-${z}`;
  // Calle interior de frío: fila de nodos del transversal z = −34 (al sur de los racks de frío).
  const coldZ = (CROSS_BANDS[1][0] + CROSS_BANDS[1][1]) / 2;
  const coldStreet = (x: number) => near('aisle-F-', `-X-${coldZ}`, x);
  const crossZ = STRAP_CROSS_Z;

  const west: { id: string; k: number }[] = [{ id: spineNode(STRAP_WEST_X), k: SPINE_Z }];
  const east: { id: string; k: number }[] = [{ id: spineNode(STRAP_EAST_X), k: SPINE_Z }];
  const out: { id: string; k: number }[] = [];
  for (const [list, x, fn] of [
    [west, STRAP_WEST_X, wId],
    [east, STRAP_EAST_X, eId],
    [out, STRAP_OUT_X, oId],
  ] as const) {
    const top = coldStreet(x);
    if (top) list.push({ id: top.id, k: top.z });
    addNode(fn(crossZ), x, crossZ);
    list.push({ id: fn(crossZ), k: crossZ });
  }
  for (const st of strappers) {
    addNode(wId(st.input.z), STRAP_WEST_X, st.input.z);
    west.push({ id: wId(st.input.z), k: st.input.z });
    addNode(`strap-${st.id}-in`, st.input.x, st.input.z);
    addEdge(wId(st.input.z), `strap-${st.id}-in`);
    addNode(`strap-${st.id}-out`, st.output.x, st.output.z);
    out.push({ id: `strap-${st.id}-out`, k: st.output.z });
  }

  // Conexión directa de F-03 (x = 49.9) a través de la nueva puerta del tabique z = -25:
  const midX = aisleAxisX(30, 3);
  const mId = (z: number) => `strap-m-${z}`;
  const midTop = coldStreet(midX);
  if (midTop) {
    addNode(mId(-20), midX, -20);
    addEdge(midTop.id, mId(-20));
    addNode(wId(-20), STRAP_WEST_X, -20);
    west.push({ id: wId(-20), k: -20 });
    addEdge(wId(-20), mId(-20));
    addNode(oId(-20), STRAP_OUT_X, -20);
    out.push({ id: oId(-20), k: -20 });
    addEdge(mId(-20), oId(-20));
  }
  // Calle norte de congelado: entra por el hueco del tabique x = 70.
  addNode(eId(CONG_NORTH_STREET_Z), STRAP_EAST_X, CONG_NORTH_STREET_Z);
  east.push({ id: eId(CONG_NORTH_STREET_Z), k: CONG_NORTH_STREET_Z });
  const congNorth = near('north-C-', '', 70);
  if (congNorth) addEdge(eId(CONG_NORTH_STREET_Z), congNorth.id);

  // Playa de seco: calle de entrega al norte de las cabeceras de sus calles, unida al punto de entrega.
  const seco = consolidation.find((c) => c.temps.includes('dry'));
  if (seco) {
    const dropId = `cons-${seco.id}-drop`;
    addNode(dropId, seco.dropPoint.x, seco.dropPoint.z);
    out.push({ id: dropId, k: seco.dropPoint.z });
    const street = [...seco.lanes.map((l) => ({ id: `cons-${l.id}-head`, x: l.x })), { id: dropId, x: seco.dropPoint.x }].sort((p, q) => p.x - q.x);
    for (const n of street) if (n.id !== dropId) addNode(n.id, n.x, seco.dropPoint.z);
    for (let i = 1; i < street.length; i++) addEdge(street[i - 1].id, street[i].id);
  }
  chain(west);
  chain(east);
  chain(out);

  // Transversal z = 6: del último pasillo de seco al primero de congelado, por los tres pasillos N-S.
  const crossNodes = nodes.filter((n) => n.id.startsWith('aisle-') && n.id.endsWith(`-X-${crossZ}`));
  const secoX = crossNodes.filter((n) => n.x < 30).sort((p, q) => q.x - p.x)[0];
  const congX = crossNodes.filter((n) => n.x > 70).sort((p, q) => p.x - q.x)[0];
  const cross = [
    { id: wId(crossZ), k: STRAP_WEST_X },
    { id: oId(crossZ), k: STRAP_OUT_X },
    { id: eId(crossZ), k: STRAP_EAST_X },
  ];
  if (secoX) cross.push({ id: secoX.id, k: secoX.x });
  if (congX) cross.push({ id: congX.id, k: congX.x });
  chain(cross);
}

/**
 * Pasillo de servicio este (x = 110): puertas del tabique x = 104 de las cámaras y explanada noreste con las
 * playas de frío y congelado. Devuelve las paradas que se encadenan con las calles de los muelles este.
 */
function eastServiceStops(
  nodes: GraphNode[],
  addNode: (id: string, x: number, z: number) => void,
  addEdge: (a: string, b: string) => void,
  consolidation: ConsolidationArea[],
): { id: string; z: number }[] {
  const stops: { id: string; z: number }[] = [];
  const stop = (z: number) => {
    const id = `ce-z${z}`;
    addNode(id, EAST_CORRIDOR_X, z);
    stops.push({ id, z });
    return id;
  };
  // Último nodo (más al este) de una fila de la cámara.
  const lastOf = (prefix: string, suffix: string) =>
    nodes.filter((n) => n.id.startsWith(prefix) && n.id.endsWith(suffix)).sort((p, q) => q.x - p.x)[0];
  const coldDoors: { z: number; node: GraphNode | undefined }[] = [
    { z: NORTH_STREET_Z, node: lastOf('north-F-', '') },
    ...CROSS_BANDS.slice(0, 2).map(([z0, z1]) => ({ z: (z0 + z1) / 2, node: lastOf('aisle-F-', `-X-${(z0 + z1) / 2}`) })),
    { z: CONG_NORTH_STREET_Z, node: lastOf('north-C-', '') },
    { z: (CROSS_BANDS[2][0] + CROSS_BANDS[2][1]) / 2, node: lastOf('aisle-C-', `-X-${(CROSS_BANDS[2][0] + CROSS_BANDS[2][1]) / 2}`) },
    { z: CONG_SOUTH_STREET_Z, node: lastOf('south-C-', '') },
  ];
  for (const d of coldDoors) {
    const id = stop(d.z);
    if (d.node) addEdge(d.node.id, id);
  }
  // Explanada noreste: tres calles E-O desde el pasillo de servicio, con un nodo frente a cada calle de frío y congelado
  // (la entrega y la recogida se hacen en la cabecera y el fondo de esas calles, junto a estas).
  const coldXs = [...new Set(consolidation.filter((c) => !c.temps.includes('dry')).flatMap((c) => c.lanes.map((l) => l.x)))].sort((a, b) => a - b);
  for (const z of Object.values(NE_STREETS)) {
    const id = stop(z);
    const pts = [
      ...coldXs.map((x) => ({ id: `ne-${z}-${x}`, p: { x, z } })),
      ...consolidation
        .filter((c) => !c.temps.includes('dry') && Math.abs(c.dropPoint.z - z) < 0.01)
        .map((c) => ({ id: `cons-${c.id}-drop`, p: c.dropPoint })),
    ].sort((p1, p2) => p1.p.x - p2.p.x);
    let prev = id;
    for (const q of pts) {
      addNode(q.id, q.p.x, q.p.z);
      addEdge(prev, q.id);
      prev = q.id;
    }
  }
  return stops;
}

function buildIndoorGraph(
  rackLines: RackLine[],
  crossAisles: Rect[],
  docks: Dock[],
  rooms: WarehouseRoom[],
  aisles: Aisle[],
  strappers: Strapper[],
  consolidation: ConsolidationArea[],
): Graph {
  // Los nodos van en el centro del pasillo, nunca en el eje de una estantería.
  const aisleX = new Map(aisles.map((a) => [a.id, a.xCenter]));
  // Ninguna arista corta una estantería, un tren de flejado, una playa de consolidación ni un tabique de cámara.
  const rects = [...rackRects(rackLines), ...strappers.map((s) => s.rect), ...consolidation.map((c) => c.rect)];
  const partitions = buildPartitions();
  const clear = (a: GraphNode, b: GraphNode) => segmentClear(a.x, a.z, b.x, b.z, rects) && !crossesPartition(a.x, a.z, b.x, b.z, partitions);
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
    if (!clear(nodes[a], nodes[b])) return;
    edges.push({ from, to });
    edges.push({ from: to, to: from });
  };
  const addDirectedEdge = (from: string, to: string) => {
    const a = nodeIndex.get(from);
    const b = nodeIndex.get(to);
    if (a === undefined || b === undefined) return;
    if (!clear(nodes[a], nodes[b])) return;
    edges.push({ from, to, directed: true });
  };
  const spineNode = (x: number) => `spine-${Math.round(x * 100) / 100}`;

  const zoneSpec = new Map(RACK_ZONES.map((rz) => [rz.zoneId, rz]));
  // Un transversal pertenece a un pasillo si cae en su tramo de racks (o justo al final, como el z = −34 de frío).
  const bandOnAisle = (cz: number, head: number, tail: number) => cz >= head - 4 && cz <= tail + 10;

  // Pasillos: nodos en cada extremo de segmento y su centro.
  const aisleXZ: { aisleId: string; zoneId: ZoneId; x: number; z: number; head: number; tail: number }[] = [];
  for (const line of rackLines) {
    const key = `${line.zoneId}:${line.aisleId}`;
    if (aisleXZ.some((a) => `${a.zoneId}:${a.aisleId}` === key)) continue;
    const x = aisleX.get(line.aisleId) ?? line.xCenter;
    const head = line.segments[0].zStart;
    const tail = line.segments[line.segments.length - 1].zEnd;
    addNode(`aisle-${line.aisleId}-N`, x, head + 0.5);
    addNode(`aisle-${line.aisleId}-S`, x, tail + 0.5);
    aisleXZ.push({ aisleId: line.aisleId, zoneId: line.zoneId, x, z: (head + tail) / 2, head, tail });

    const isFrio = line.zoneId === 'frio';
    const frioS2N = isFrio && (line.aisleId === 'F-01' || line.aisleId === 'F-04');
    const frioN2S = isFrio && !frioS2N;

    // Nodos en los pasillos transversales que cortan esta columna.
    for (const ca of crossAisles) {
      const cz = (ca.zMin + ca.zMax) / 2;
      if (x > ca.xMin && x < ca.xMax && bandOnAisle(cz, head, tail)) {
        addNode(`aisle-${line.aisleId}-X-${cz}`, x, cz);
        if (frioS2N) {
          if (cz === -34) {
            addDirectedEdge(`aisle-${line.aisleId}-X-${cz}`, `aisle-${line.aisleId}-S`);
          } else {
            addDirectedEdge(`aisle-${line.aisleId}-S`, `aisle-${line.aisleId}-X-${cz}`);
            addDirectedEdge(`aisle-${line.aisleId}-X-${cz}`, `aisle-${line.aisleId}-N`);
          }
        } else if (frioN2S) {
          if (cz === -34) {
            addDirectedEdge(`aisle-${line.aisleId}-S`, `aisle-${line.aisleId}-X-${cz}`);
          } else {
            addDirectedEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-X-${cz}`);
            addDirectedEdge(`aisle-${line.aisleId}-X-${cz}`, `aisle-${line.aisleId}-S`);
          }
        } else {
          addEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-X-${cz}`);
          addEdge(`aisle-${line.aisleId}-X-${cz}`, `aisle-${line.aisleId}-S`);
        }
      }
    }
    if (frioS2N) {
      addDirectedEdge(`aisle-${line.aisleId}-S`, `aisle-${line.aisleId}-N`);
    } else if (frioN2S) {
      addDirectedEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-S`);
    } else {
      addEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-S`);
    }
    // Calle norte (7 m entre el muro o tabique norte y la cabecera de los racks), por su eje.
    const spec = zoneSpec.get(line.zoneId);
    addNode(`north-${line.aisleId}`, x, spec?.northStreetZ ?? head - 2.5);
    if (frioS2N) {
      addDirectedEdge(`aisle-${line.aisleId}-N`, `north-${line.aisleId}`);
    } else if (frioN2S) {
      addDirectedEdge(`north-${line.aisleId}`, `aisle-${line.aisleId}-N`);
    } else {
      addEdge(`aisle-${line.aisleId}-N`, `north-${line.aisleId}`);
    }
    // Calle interior sur de una cámara cerrada (congelado): une todos sus pasillos.
    if (spec?.southStreet) {
      addNode(`south-${line.aisleId}`, x, spec.southStreet.z);
      addEdge(`aisle-${line.aisleId}-S`, `south-${line.aisleId}`);
    }
  }

  // Los pasillos de una misma calle se enlazan por sus transversales, y todos por la calle norte.
  for (const ca of crossAisles) {
    const cz = (ca.zMin + ca.zMax) / 2;
    const row = aisleXZ.filter((a) => a.x > ca.xMin && a.x < ca.xMax && bandOnAisle(cz, a.head, a.tail)).sort((p, q) => p.x - q.x);
    for (let i = 0; i < row.length - 1; i++) {
      addEdge(`aisle-${row[i].aisleId}-X-${cz}`, `aisle-${row[i + 1].aisleId}-X-${cz}`);
    }
  }
  // Calles norte: una fila por cota (seco + frío en z = −111,25; congelado en z = −21,25).
  const northRows = new Map<number, typeof aisleXZ>();
  for (const a of aisleXZ) {
    const z = zoneSpec.get(a.zoneId)?.northStreetZ ?? 0;
    northRows.set(z, [...(northRows.get(z) ?? []), a]);
  }
  for (const row of northRows.values()) {
    row.sort((p, q) => p.x - q.x);
    for (let i = 0; i < row.length - 1; i++) addEdge(`north-${row[i].aisleId}`, `north-${row[i + 1].aisleId}`);
  }
  // Calles interiores sur con sus puertas (centradas en el hueco) hacia el spine.
  const southDoorXs: number[] = [];
  for (const rz of RACK_ZONES) {
    if (!rz.southStreet) continue;
    const stops = aisleXZ.filter((a) => a.zoneId === rz.zoneId).map((a) => ({ id: `south-${a.aisleId}`, x: a.x }));
    for (const dx of rz.southStreet.doors) {
      const id = `door-${rz.zoneId}-${dx}`;
      addNode(id, dx, rz.southStreet.z);
      stops.push({ id, x: dx });
      southDoorXs.push(dx);
    }
    stops.sort((p, q) => p.x - q.x);
    for (let i = 0; i < stops.length - 1; i++) addEdge(stops[i].id, stops[i + 1].id);
  }

  // Enlaces seco | frío a través del tabique x = 30, por el centro de sus huecos (transversales).
  const lastSeco = aisleXZ.filter((a) => a.zoneId === 'seco').sort((p, q) => q.x - p.x)[0];
  const firstFrio = aisleXZ.filter((a) => a.zoneId === 'frio').sort((p, q) => p.x - q.x)[0];
  if (lastSeco && firstFrio) {
    for (const [z0, z1] of CROSS_BANDS.slice(0, 2)) {
      const cz = (z0 + z1) / 2;
      addEdge(`aisle-${lastSeco.aisleId}-X-${cz}`, `aisle-${firstFrio.aisleId}-X-${cz}`);
    }
  }

  // Salas de carga y de máquinas:
  // Circuito de sentido único sin colisiones:
  // - Entrada por Calle Este (TRUNK_X = -109.5, sentido Norte)
  // - Salida por Calle Oeste (DRIVE_AISLE_X = -118.5, sentido Sur)
  // - Pasos transversales de interconexión en cabecera norte (-114.5), amortiguación (-89) y transversal (-34).
  // La sala anexa tiene su propia red de doble sentido (más abajo): sus plazas no entran en este circuito de sentido único.
  const allSpots = rooms.filter((r) => r.id !== ANNEX_ROOM_ID).flatMap((r) => r.spots);
  const aisle1Spots = allSpots.filter((s) => s.x < -120).sort((a, b) => a.z - b.z);
  const aisle2Spots = allSpots.filter((s) => s.x >= -120).sort((a, b) => a.z - b.z);

  // Nodos fijos de interconexión
  const crossNorthW = 'room-cross-north-w';
  const crossNorthE = 'room-cross-north-e';
  const bufW = 'room-buf-w';
  const bufE = 'room-buf-e';
  const cross1Id = `room-cross-1-${ROOM_ENTRANCE_Z}`;
  const cross2Id = `room-cross-2-${ROOM_ENTRANCE_Z}`;
  const southW = 'room-south-w';
  const southE = 'room-south-e';

  addNode(crossNorthW, DRIVE_AISLE_X, -114.5);
  addNode(crossNorthE, TRUNK_X, -114.5);
  addNode(bufW, DRIVE_AISLE_X, -89);
  addNode(bufE, TRUNK_X, -89);
  addNode(cross1Id, DRIVE_AISLE_X, ROOM_ENTRANCE_Z);
  addNode(cross2Id, TRUNK_X, ROOM_ENTRANCE_Z);
  addNode(southW, DRIVE_AISLE_X, -14);
  addNode(southE, TRUNK_X, -14);

  // Plazas y sus accesos
  for (const spot of allSpots) {
    addNode(`spot-${spot.id}`, spot.x, spot.z);
    if (spot.x < -120) {
      // Columna Oeste: acceso y salida desde Calle Oeste
      const accId = `room-access-${spot.id}`;
      addNode(accId, DRIVE_AISLE_X, spot.z);
      addEdge(accId, `spot-${spot.id}`);
    } else if (spot.x > TRUNK_X) {
      // Columna Este 2 (junto a la calle troncal, al otro lado de la columna central): entra y sale por su acceso
      // de la troncal, que sube hacia el Norte. No cruza la columna central.
      const accId = `room-access-${spot.id}`;
      addNode(accId, TRUNK_X, spot.z);
      addDirectedEdge(accId, `spot-${spot.id}`);
      addDirectedEdge(`spot-${spot.id}`, accId);
    } else {
      // Columna Este: se entra desde Calle Este y se sale hacia Calle Oeste
      const accId = `room-access-${spot.id}`;
      const exitId = `room-exit-${spot.id}`;
      addNode(accId, TRUNK_X, spot.z);
      addNode(exitId, DRIVE_AISLE_X, spot.z);
      addDirectedEdge(accId, `spot-${spot.id}`);
      addDirectedEdge(`spot-${spot.id}`, exitId);
      addEdge(accId, `spot-${spot.id}`);
    }
  }

  // Calle Este (Entrada): todos los nodos ordenados de sur a norte, sentido único hacia el Norte (z decreciente)
  const eastNodes = [
    { id: southE, z: -14 },
    { id: cross2Id, z: ROOM_ENTRANCE_Z },
    { id: bufE, z: -89 },
    { id: crossNorthE, z: -114.5 },
    ...aisle2Spots.map((s) => ({ id: `room-access-${s.id}`, z: s.z })),
  ].sort((a, b) => b.z - a.z); // de mayor z (sur) a menor z (norte)

  for (let i = 0; i < eastNodes.length - 1; i++) {
    addDirectedEdge(eastNodes[i].id, eastNodes[i + 1].id);
  }

  // Calle Oeste (Salida): todos los nodos ordenados de norte a sur, sentido único hacia el Sur (z creciente)
  const westNodesMap = new Map<string, number>();
  westNodesMap.set(crossNorthW, -114.5);
  westNodesMap.set(bufW, -89);
  westNodesMap.set(cross1Id, ROOM_ENTRANCE_Z);
  westNodesMap.set(southW, -14);
  for (const s of aisle1Spots) westNodesMap.set(`room-access-${s.id}`, s.z);
  for (const s of aisle2Spots) if (s.x < TRUNK_X) westNodesMap.set(`room-exit-${s.id}`, s.z);

  const westNodes = [...westNodesMap.entries()]
    .map(([id, z]) => ({ id, z }))
    .sort((a, b) => a.z - b.z); // de menor z (norte) a mayor z (sur)

  for (let i = 0; i < westNodes.length - 1; i++) {
    addDirectedEdge(westNodes[i].id, westNodes[i + 1].id);
  }

  // Crossovers transversales de Calle Este hacia Calle Oeste (hacia -X):
  addDirectedEdge(crossNorthE, crossNorthW);
  addDirectedEdge(bufE, bufW);
  addDirectedEdge(cross2Id, cross1Id);
  // Bucle sur: retorno de salida hacia Calle Este si se desea incorporar al circuito
  addDirectedEdge(southW, southE);

  // Conexión 1: Pasillo transversal z = -34 con el almacén
  let nearestCross = { id: '', d: Infinity };
  for (const n of nodes) {
    if (!n.id.endsWith(`-X-${ROOM_ENTRANCE_Z}`)) continue;
    const d = (n.x - TRUNK_X) ** 2 + (n.z - ROOM_ENTRANCE_Z) ** 2;
    if (d < nearestCross.d && segmentClear(TRUNK_X, ROOM_ENTRANCE_Z, n.x, n.z, rects)) nearestCross = { id: n.id, d };
  }
  if (nearestCross.id) {
    addEdge(cross2Id, nearestCross.id);
    addEdge(cross1Id, nearestCross.id);
  }

  // Sala anexa (red de doble sentido): una calle N-S por columna de plazas, un nodo de acceso por plaza (la plaza solo
  // se une a su acceso) y una calle por z = −34 que sale por la puerta del muro x = −125 hasta `room-cross-1-−34`.
  const annexRoom = rooms.find((r) => r.id === ANNEX_ROOM_ID);
  if (annexRoom) {
    const laneCross = (laneX: number) => `room-annex-cross-${laneX}`;
    const lanes = [...ANNEX_LANE_X].sort((a, b) => b - a); // de este a oeste
    for (const laneX of lanes) {
      addNode(laneCross(laneX), laneX, ROOM_ENTRANCE_Z);
      // Plazas de la columna que se sirve desde esta calle (la calle está 4 m al este de su columna).
      const colSpots = annexRoom.spots.filter((s) => Math.abs(s.x + 4 - laneX) < 0.01).sort((a, b) => b.z - a.z); // de sur a norte
      let prev = laneCross(laneX);
      for (const s of colSpots) {
        const accId = `room-access-${s.id}`;
        addNode(accId, laneX, s.z);
        addNode(`spot-${s.id}`, s.x, s.z);
        addEdge(prev, accId);
        addEdge(accId, `spot-${s.id}`);
        prev = accId;
      }
    }
    // Calle de la puerta: de la calle más oriental a la siguiente, y de ahí por la puerta a la sala principal.
    addEdge(cross1Id, laneCross(lanes[0]));
    for (let i = 0; i < lanes.length - 1; i++) addEdge(laneCross(lanes[i]), laneCross(lanes[i + 1]));
  }

  // Conexión 2: Calle norte con la cabecera norte de Calle Este
  let nearestNorth = { id: '', d: Infinity };
  for (const n of nodes) {
    if (!n.id.startsWith('north-')) continue;
    const d = (n.x - TRUNK_X) ** 2 + (n.z - -114.5) ** 2;
    if (d < nearestNorth.d && segmentClear(TRUNK_X, -114.5, n.x, n.z, rects)) nearestNorth = { id: n.id, d };
  }
  if (nearestNorth.id) addEdge(crossNorthE, nearestNorth.id);

  // Spine frontal al sur de los racks (banda z 43…50), que conecta todos los pasillos con Expedición.
  const spineZ = SPINE_Z;
  const spineXs = new Set<number>();
  for (const a of aisleXZ) spineXs.add(a.x);
  for (const dk of docks) if (dk.face === 'south') spineXs.add(dk.x);
  // Columna del pasillo de servicio este: su nodo de spine une las calles en batería con Expedición.
  spineXs.add(EAST_CORRIDOR_X);
  // Pasillos del área de flejado y recogida de la playa de consolidación.
  spineXs.add(STRAP_WEST_X);
  spineXs.add(STRAP_EAST_X);
  // Fondo de cada calle de seco (donde recoge la transpaleta), frente al espinazo.
  for (const c of consolidation) if (c.temps.includes('dry')) for (const l of c.lanes) spineXs.add(l.x);
  for (const dx of southDoorXs) spineXs.add(dx);
  const sortedXs = [...spineXs].sort((a, b) => a - b);
  for (let i = 0; i < sortedXs.length - 1; i++) {
    const a = spineNode(sortedXs[i]);
    const b = spineNode(sortedXs[i + 1]);
    addNode(a, sortedXs[i], spineZ);
    addNode(b, sortedXs[i + 1], spineZ);
    addEdge(a, b);
  }
  // Cada pasillo de seco engancha al spine de su columna; las cámaras salen solo por sus puertas.
  for (const a of aisleXZ) {
    if (a.zoneId === 'seco') addEdge(`aisle-${a.aisleId}-S`, spineNode(a.x));
  }
  for (const dx of southDoorXs) {
    for (const rz of RACK_ZONES) if (rz.southStreet?.doors.includes(dx)) addEdge(`door-${rz.zoneId}-${dx}`, spineNode(dx));
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
  eastStops.push(...eastServiceStops(nodes, addNode, addEdge, consolidation));
  eastStops.sort((p, q) => p.z - q.z);
  for (let i = 0; i < eastStops.length - 1; i++) {
    addEdge(eastStops[i].id, eastStops[i + 1].id);
  }

  addStrapperNetwork(nodes, addNode, addEdge, spineNode, strappers, consolidation);

  return { nodes, edges };
}

function buildYardGraph(docks: Dock[]): Graph {
  const nodes: GraphNode[] = [
    { id: 'gate', x: 238, z: 178 },
    { id: 'scale', x: 160, z: 150 },
    { id: 'yard-e', x: 161, z: 105 },
    { id: 'yard-c', x: 0, z: 105 },
    { id: 'yard-w', x: -120, z: 105 },
    { id: 'park-e', x: 70, z: 140 },
    { id: 'park-w', x: -70, z: 140 },
    { id: 'exit', x: 260, z: 170 },
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
    // Tramo sur: la maniobra llega desde el patio (z = 95). Tramo este: desde el patio del este (x = FACE_V.east + 8).
    const p = dk.face === 'south' ? { x: dk.x, z: 95 } : { x: FACE_V.east + 8, z: dk.z };
    nodes.push({ id: `ydock-${dk.id}`, x: p.x, z: p.z });
    const anchor = dk.face === 'east' ? 'yard-e' : dk.x < -40 ? 'yard-w' : dk.x > 40 ? 'yard-e' : 'yard-c';
    edges.push({ from: `ydock-${dk.id}`, to: anchor });
  }

  return { nodes, edges };
}

/**
 * Aseos: dos módulos de 10 × 8 m pegados a la fachada (su muro exterior es el de la nave), cada uno con una
 * puerta que da a espacio libre. WC-02 en el sur (expedición oeste), WC-03 en la esquina noreste (puerta al
 * oeste, hacia la calle que lleva al pasillo de servicio), fuera de la explanada de las playas de frío.
 */
const RESTROOMS: Restroom[] = [
  { id: 'WC-02', label: 'Aseos', rect: { xMin: -125, xMax: -115, zMin: 72, zMax: 80 }, door: { side: 'n', at: -120, width: 1.6 } },
  { id: 'WC-03', label: 'Aseos', rect: { xMin: BUILDING_X_MAX - 10, xMax: BUILDING_X_MAX, zMin: BUILDING_Z_MIN, zMax: BUILDING_Z_MIN + 8 }, door: { side: 'w', at: BUILDING_Z_MIN + 4, width: 1.6 } },
];

export function buildPintoLayout(): WarehouseLayout {
  const rooms = buildRooms();
  const { aisles, rackLines, crossAisles } = buildRackLines();
  const docks = buildDocks();
  const site = buildSite();
  const consolidation = buildConsolidation();

  // Recuento de ubicaciones de rack.
  let locations = 0;
  for (const line of rackLines) {
    let modules = 0;
    for (const seg of line.segments) modules += seg.moduleCount;
    locations += modules * 3 * line.levels;
  }
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
      rect: { xMin: BUILDING_X_MIN, xMax: BUILDING_X_MAX, zMin: BUILDING_Z_MIN, zMax: BUILDING_Z_MAX },
      freeHeight: FREE_HEIGHT,
      annex: ANNEX_RECT,
    },
    zones: zones(),
    aisles,
    rackLines,
    crossAisles,
    docks,
    site,
    rooms,
    restrooms: RESTROOMS,
    strappers: STRAPPERS,
    consolidation,
    indoorGraph: buildIndoorGraph(rackLines, crossAisles, docks, rooms, aisles, STRAPPERS, consolidation),
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
        // Numeración de almacén: el lado B lleva los módulos impares y el A los pares (códigos únicos por pasillo).
        const modNum = line.side === 'B' ? 2 * (seg.firstModule + m) - 1 : 2 * (seg.firstModule + m);
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

/** RNG determinista para la ocupación inicial (~85 %). */
export function seededRandom(seed = 20250301) {
  return mulberry32(seed);
}