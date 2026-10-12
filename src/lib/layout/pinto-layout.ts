import type { ZoneId } from '@/lib/types';
import {
  ZONE_SYMBOLS,
  locationId,
  type Aisle,
  type Dock,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type LayoutStats,
  type RackLine,
  type RackSlot,
  type Rect,
  type SiteElements,
  type WarehouseLayout,
  type ZoneInfo,
} from '@/lib/layout/types';

// --- Cifras de partida (metros, ajustables) ---
const PARCEL: Rect = { xMin: -210, xMax: 210, zMin: -150, zMax: 185 };
const ROAD_WIDTH = 8;
const BUILDING_WIDTH = 250; // x
const BUILDING_DEPTH = 160; // z
const FREE_HEIGHT = 13;

const RACK_DEPTH = 1.1;
const AISLE_WIDTH = 3.2;
const BACK_GAP = 0.2;
const PITCH = RACK_DEPTH * 2 + BACK_GAP + AISLE_WIDTH; // 5,6 m
const MODULE = 2.7; // frente de módulo: 3 palets de 0,8 m
const SLOT_WIDTH = 0.8;
const LEVEL_HEIGHT = 1.6;

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
  segments: { zStart: number; zEnd: number }[];
}

const RACK_ZONES: RackZoneSpec[] = [
  {
    zoneId: 'seco',
    storageBegin: -105,
    storageEnd: 30,
    levels: 7,
    segments: [
      { zStart: -76, zEnd: -36 },
      { zStart: -32, zEnd: 4 },
      { zStart: 8, zEnd: 44 },
    ],
  },
  {
    zoneId: 'frio',
    storageBegin: 30,
    storageEnd: 125,
    levels: 5,
    segments: [{ zStart: -76, zEnd: -29 }],
  },
  {
    zoneId: 'congelado',
    storageBegin: 70,
    storageEnd: 125,
    levels: 6,
    segments: [{ zStart: -21, zEnd: 46 }],
  },
];

function zones(): ZoneInfo[] {
  return [
    { id: 'seco', label: 'Seco', color: '#c9ced6', temp: '16–22 ºC', rect: { xMin: -125, xMax: 30, zMin: -80, zMax: 50 }, storage: 'rack', levels: 7, rackSegments: RACK_ZONES[0].segments },
    { id: 'carga_baterias', label: 'Carga de baterías', color: '#9aa3b5', temp: '—', rect: { xMin: -125, xMax: -105, zMin: -80, zMax: -40 }, storage: 'none' },
    { id: 'frio', label: 'Frío', color: '#7cc4f0', temp: '+2/+4 ºC', rect: { xMin: 30, xMax: 125, zMin: -80, zMax: -25 }, storage: 'rack', levels: 5, rackSegments: RACK_ZONES[1].segments },
    { id: 'fyv', label: 'Frutas y verduras', color: '#8fd694', temp: '+6 ºC · 85–90 % HR', rect: { xMin: 30, xMax: 70, zMin: -25, zMax: 50 }, storage: 'floor' },
    { id: 'congelado', label: 'Congelado', color: '#b9e3ff', temp: '−22/−25 ºC', rect: { xMin: 70, xMax: 125, zMin: -25, zMax: 50 }, storage: 'rack', levels: 6, rackSegments: RACK_ZONES[2].segments },
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
    // Espacio sobrante al este del último pasillo.
    for (let i = 0; i < aisleCount; i++) {
      const xStart = rz.storageBegin + i * PITCH;
      const aisleNum = i + 1;
      const aisleId = `${symbol}-${String(aisleNum).padStart(2, '0')}`;
      const aisleCenter = xStart + RACK_DEPTH + AISLE_WIDTH / 2;
      const rackBCenter = xStart + RACK_DEPTH / 2;
      const rackACenter = xStart + RACK_DEPTH + AISLE_WIDTH + RACK_DEPTH / 2;

      aisles.push({ id: aisleId, zoneId: rz.zoneId, xCenter: aisleCenter });

      let firstModule = 1;
      const segments = rz.segments.map((seg) => {
        const count = Math.floor((seg.zEnd - seg.zStart) / MODULE);
        const first = firstModule;
        firstModule += count;
        return { zStart: seg.zStart, zEnd: seg.zStart + count * MODULE, firstModule: first, moduleCount: count };
      });

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

    // Pasillos transversales de 4 m entre segmentos de la zona.
    for (let s = 0; s < rz.segments.length - 1; s++) {
      const gapStart = rz.segments[s].zEnd;
      const gapEnd = rz.segments[s + 1].zStart;
      if (gapEnd - gapStart >= 3) {
        crossAisles.push({ xMin: rz.storageBegin, xMax: rz.storageEnd, zMin: gapStart, zMax: gapEnd });
      }
    }
  }

  return { aisles, rackLines, crossAisles };
}

function buildDocks(): Dock[] {
  const docks: Dock[] = [];
  const dockStartX = -120;
  const dockCount = 60;
  const spacing = 4;
  for (let i = 0; i < dockCount; i++) {
    const x = dockStartX + (i + 0.5) * spacing;
    const kind: Dock['kind'] = i < 14 ? 'inbound' : 'outbound';
    const temp: Dock['temp'] = x < 30 ? 'dry' : x < 70 ? 'cool' : 'frozen';
    docks.push({
      id: `D${String(i + 1).padStart(2, '0')}`,
      index: i,
      x,
      kind,
      temp,
      doorWidth: 3,
      levelerDepth: 2.5,
      laneRect: { xMin: x - 1.5, xMax: x + 1.5, zMin: 54, zMax: 76 },
    });
  }
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

function buildIndoorGraph(rackLines: RackLine[], crossAisles: Rect[], docks: Dock[]): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIndex = new Map<string, number>();

  const addNode = (id: string, x: number, z: number) => {
    if (nodeIndex.has(id)) return;
    nodeIndex.set(id, nodes.length);
    nodes.push({ id, x, z });
  };
  const addEdge = (from: string, to: string) => {
    edges.push({ from, to });
    edges.push({ from: to, to: from });
  };

  // Pasillos: nodos en cada extremo de segmento y su centro.
  const aisleXZ: { aisleId: string; zoneId: ZoneId; x: number; z: number }[] = [];
  for (const line of rackLines) {
    const key = `${line.zoneId}:${line.aisleId}`;
    if (aisleXZ.some((a) => `${a.zoneId}:${a.aisleId}` === key)) continue;
    const x = line.xCenter;
    const head = line.segments[0].zStart;
    const tail = line.segments[line.segments.length - 1].zEnd;
    addNode(`aisle-${line.aisleId}-N`, x, head + 0.5);
    addNode(`aisle-${line.aisleId}-S`, x, tail + 0.5);
    aisleXZ.push({ aisleId: line.aisleId, zoneId: line.zoneId, x, z: (head + tail) / 2 });

    // Nodos en los pasillos transversales que cortan esta columna.
    for (const ca of crossAisles) {
      const cz = (ca.zMin + ca.zMax) / 2;
      // Solo si este pasillo cae dentro del rango x del cruzamiento.
      if (line.xCenter > ca.xMin && line.xCenter < ca.xMax) {
        addNode(`aisle-${line.aisleId}-X-${cz}`, line.xCenter, cz);
        addEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-X-${cz}`);
        addEdge(`aisle-${line.aisleId}-X-${cz}`, `aisle-${line.aisleId}-S`);
      }
    }
    addEdge(`aisle-${line.aisleId}-N`, `aisle-${line.aisleId}-S`);
  }

  // Spine frontal al sur de los racks, que conecta todos los pasillos con Expedición.
  const spineZ = 47;
  const spineXs = new Set<number>();
  for (const a of aisleXZ) spineXs.add(a.x);
  for (const dk of docks) spineXs.add(dk.x);
  const sortedXs = [...spineXs].sort((a, b) => a - b);
  for (const a of aisleXZ) {
    addNode(`spine-${a.aisleId}`, a.x, spineZ);
    addEdge(`aisle-${a.aisleId}-S`, `spine-${a.aisleId}`);
  }

  for (let i = 0; i < sortedXs.length - 1; i++) {
    const a = `spine-${Math.round(sortedXs[i] * 100) / 100}`;
    const b = `spine-${Math.round(sortedXs[i + 1] * 100) / 100}`;
    addNode(a, sortedXs[i], spineZ);
    addNode(b, sortedXs[i + 1], spineZ);
    addEdge(a, b);
  }

  // Muelles: cada lane se conecta al spine y al frente del muelle.
  for (const dk of docks) {
    addNode(`lane-${dk.id}`, dk.x, 60);
    addNode(`dock-${dk.id}`, dk.x, 78);
    addEdge(`lane-${dk.id}`, `dock-${dk.id}`);
    const spineId = `spine-${dk.id}`;
    addNode(spineId, dk.x, spineZ);
    addEdge(spineId, `lane-${dk.id}`);
  }
  // Conexión horizontal de los lanes entre sí.
  const laneXs = docks.map((d) => d.x).sort((a, b) => a - b);
  for (let i = 0; i < laneXs.length - 1; i++) {
    const a = `c-lane-${laneXs[i]}`;
    const b = `c-lane-${laneXs[i + 1]}`;
    addNode(a, laneXs[i], 60);
    addNode(b, laneXs[i + 1], 60);
    addEdge(a, b);
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
    nodes.push({ id: `ydock-${dk.id}`, x: dk.x, z: 95 });
    const anchor = dk.x < -40 ? 'yard-w' : dk.x > 40 ? 'yard-e' : 'yard-c';
    edges.push({ from: `ydock-${dk.id}`, to: anchor });
  }

  return { nodes, edges };
}

export function buildPintoLayout(): WarehouseLayout {
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
    indoorGraph: buildIndoorGraph(rackLines, crossAisles, docks),
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