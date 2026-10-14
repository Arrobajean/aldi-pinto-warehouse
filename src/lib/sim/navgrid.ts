/**
 * Retícula de navegación de la nave para la planificación cooperativa de las máquinas.
 *
 * Celdas de CELL m (8 vecinos) sobre el suelo transitable: el que está a menos de CORRIDOR_R m de alguna arista
 * del grafo de circulación (calles, pasillos, salas), fuera de racks (con holgura para el ancho de la máquina),
 * tabiques (salvo por sus puertas), flejadoras, playas de consolidación y aseos. Dos celdas a menos de NEAR_R no
 * pueden estar ocupadas a la vez por máquinas distintas (con celdas de 1,6 m, solo la misma). En una calle de 7 m
 * caben unas 4 celdas de ancho: las máquinas se cruzan y adelantan donde caben.
 */
import { buildPartitions, crossesPartition, rackRects, segmentClear } from '@/lib/layout/pinto-layout';
import type { Rect, WarehouseLayout } from '@/lib/layout/types';
import type { Point } from '@/lib/sim/types';

/**
 * Lado de la celda (m): con 1,6 m, dos máquinas en celdas contiguas quedan a ≥ 1,6 m, así que pueden seguirse de
 * cerca sin bajar de la separación mínima (1,5 m).
 */
export const CELL = 1.6;
/** Distancia máxima a una arista del grafo para que el suelo cuente como transitable (m). */
const CORRIDOR_R = 3.8;
/** Holgura extra alrededor de racks y obstáculos (semiancho de la máquina) (m). */
const BODY = 0.45;
/** Distancia mínima a un tabique fuera de sus puertas (m). */
const WALL_CLEAR = 0.8;
/** Distancia por debajo de la cual dos celdas no pueden estar ocupadas por máquinas distintas a la vez (m). */
const NEAR_R = 1.55;
/** Semiancho de una calle de playa de consolidación transitable para la transpaleta (m). */
const LANE_HALF = 1;

export interface NavLink {
  to: number;
  dist: number;
}

export interface NavGrid {
  x: Float64Array;
  z: Float64Array;
  links: NavLink[][];
  /** Celdas incompatibles con cada celda (a menos de NEAR_R), sin incluirla. */
  near: number[][];
  /** Índice espacial (cubos de 5 m) para buscar la celda más cercana. */
  bucket: Map<string, number[]>;
  count: number;
  /** Nodos del grafo (para el heurístico): posición, vecinos con distancia y nodo más cercano de cada celda. */
  nodeX: Float64Array;
  nodeZ: Float64Array;
  nodeAdj: { to: number; d: number }[][];
  nodeOf: Int32Array;
}

function inflate(r: Rect, m: number): Rect {
  return { xMin: r.xMin - m, xMax: r.xMax + m, zMin: r.zMin - m, zMax: r.zMax + m };
}
function inside(r: Rect, x: number, z: number): boolean {
  return x > r.xMin && x < r.xMax && z > r.zMin && z < r.zMax;
}
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function buildNavGrid(layout: WarehouseLayout): NavGrid {
  const graph = layout.indoorGraph;
  const racks = rackRects(layout.rackLines);
  const obstacles: Rect[] = [
    ...racks.map((r) => inflate(r, BODY)),
    ...layout.strappers.map((s) => inflate(s.rect, BODY)),
    ...layout.restrooms.map((w) => inflate(w.rect, BODY)),
  ];
  // Playas de consolidación: el suelo de la playa está cerrado salvo sus calles, por donde entra la transpaleta.
  const zoneRects = layout.consolidation.map((c) => inflate(c.rect, 0.2));
  const laneBoxes = layout.consolidation.flatMap((c) =>
    c.lanes.map((l) => {
      const ex = l.x + l.dirX * l.length;
      const ez = l.z + l.dirZ * l.length;
      return { xMin: Math.min(l.x, ex) - LANE_HALF, xMax: Math.max(l.x, ex) + LANE_HALF, zMin: Math.min(l.z, ez) - CELL, zMax: Math.max(l.z, ez) + CELL };
    }),
  );
  const partitions = buildPartitions();
  const b = layout.building.rect;
  const pos = new Map(graph.nodes.map((n) => [n.id, n]));
  const segs = graph.edges
    .map((e) => [pos.get(e.from), pos.get(e.to)] as const)
    .filter((s): s is readonly [NonNullable<typeof s[0]>, NonNullable<typeof s[1]>] => Boolean(s[0] && s[1]));

  // Aristas por cubo (para la prueba de cercanía al corredor).
  const segBucket = new Map<string, number[]>();
  segs.forEach(([a, c], i) => {
    const x0 = Math.floor((Math.min(a.x, c.x) - CORRIDOR_R) / 10);
    const x1 = Math.floor((Math.max(a.x, c.x) + CORRIDOR_R) / 10);
    const z0 = Math.floor((Math.min(a.z, c.z) - CORRIDOR_R) / 10);
    const z1 = Math.floor((Math.max(a.z, c.z) + CORRIDOR_R) / 10);
    for (let bx = x0; bx <= x1; bx++) for (let bz = z0; bz <= z1; bz++) {
      const k = `${bx},${bz}`;
      const list = segBucket.get(k);
      if (list) list.push(i);
      else segBucket.set(k, [i]);
    }
  });
  const nearCorridor = (x: number, z: number) => {
    for (const i of segBucket.get(`${Math.floor(x / 10)},${Math.floor(z / 10)}`) ?? []) {
      const [a, c] = segs[i];
      if (segDist(x, z, a.x, a.z, c.x, c.z) <= CORRIDOR_R) return true;
    }
    return false;
  };
  const nearWall = (x: number, z: number) =>
    partitions.some((p) => {
      const [v, u] = p.along === 'x' ? [z, x] : [x, z];
      if (Math.abs(v - p.at) > WALL_CLEAR || u < p.from - WALL_CLEAR || u > p.to + WALL_CLEAR) return false;
      return !p.holes.some(([h0, h1]) => u > h0 + 0.3 && u < h1 - 0.3);
    });

  // Suelo transitable: la nave más la sala anexa (misma cota de piso, ampliación al oeste). La retícula cubre la caja
  // que envuelve a ambas; su origen se desplaza en múltiplos de CELL para no mover las celdas que ya había en la nave.
  const annex = layout.building.annex;
  const gx0 = annex && annex.xMin < b.xMin ? b.xMin - Math.ceil((b.xMin - annex.xMin) / CELL) * CELL : b.xMin;
  const gx1 = annex ? Math.max(b.xMax, annex.xMax) : b.xMax;
  const gz0 = annex && annex.zMin < b.zMin ? b.zMin - Math.ceil((b.zMin - annex.zMin) / CELL) * CELL : b.zMin;
  const gz1 = annex ? Math.max(b.zMax, annex.zMax) : b.zMax;
  const walkable = (x: number, z: number) => inside(b, x, z) || (annex !== undefined && inside(annex, x, z));
  const nx = Math.floor((gx1 - gx0) / CELL);
  const nz = Math.floor((gz1 - gz0) / CELL);
  const idAt = new Int32Array(nx * nz).fill(-1);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = gx0 + (i + 0.5) * CELL;
      const z = gz0 + (j + 0.5) * CELL;
      if (!walkable(x, z)) continue;
      // Una calle de playa es transitable aunque esté lejos del grafo: la transpaleta entra en ella hasta su hueco.
      const lane = laneBoxes.some((r) => inside(r, x, z));
      if (!lane && !nearCorridor(x, z)) continue;
      if (obstacles.some((r) => inside(r, x, z))) continue;
      if (!lane && zoneRects.some((r) => inside(r, x, z))) continue;
      if (nearWall(x, z)) continue;
      idAt[i * nz + j] = xs.length;
      xs.push(x);
      zs.push(z);
    }
  }
  const count = xs.length;
  const links: NavLink[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = idAt[i * nz + j];
      if (a < 0) continue;
      for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const c = idAt[ii * nz + jj];
        if (c < 0) continue;
        // Las diagonales necesitan libres las dos celdas que rodean (no se cortan esquinas).
        if (di !== 0 && dj !== 0 && (idAt[ii * nz + j] < 0 || idAt[i * nz + jj] < 0)) continue;
        if (!segmentClear(xs[a], zs[a], xs[c], zs[c], racks) || crossesPartition(xs[a], zs[a], xs[c], zs[c], partitions)) continue;
        const dist = Math.hypot(xs[c] - xs[a], zs[c] - zs[a]);
        links[a].push({ to: c, dist });
        links[c].push({ to: a, dist });
      }
    }
  }

  const bucket = new Map<string, number[]>();
  const bkey = (x: number, z: number) => `${Math.floor(x / 5)},${Math.floor(z / 5)}`;
  for (let i = 0; i < count; i++) {
    const k = bkey(xs[i], zs[i]);
    const list = bucket.get(k);
    if (list) list.push(i);
    else bucket.set(k, [i]);
  }
  const near: number[][] = [];
  for (let i = 0; i < count; i++) {
    const out: number[] = [];
    const bx = Math.floor(xs[i] / 5);
    const bz = Math.floor(zs[i] / 5);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of bucket.get(`${bx + dx},${bz + dz}`) ?? []) {
          if (j !== i && Math.hypot(xs[i] - xs[j], zs[i] - zs[j]) < NEAR_R) out.push(j);
        }
      }
    }
    near.push(out);
  }

  // Grafo de nodos para el heurístico (distancias por la red, mucho más pequeño que la retícula).
  const nodeIndex = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const nodeX = Float64Array.from(graph.nodes.map((n) => n.x));
  const nodeZ = Float64Array.from(graph.nodes.map((n) => n.z));
  const nodeAdj: { to: number; d: number }[][] = graph.nodes.map(() => []);
  for (const e of graph.edges) {
    const a = nodeIndex.get(e.from);
    const c = nodeIndex.get(e.to);
    if (a === undefined || c === undefined) continue;
    nodeAdj[a].push({ to: c, d: Math.hypot(nodeX[c] - nodeX[a], nodeZ[c] - nodeZ[a]) });
  }
  const nodeBucket = new Map<string, number[]>();
  graph.nodes.forEach((n, i) => {
    const k = `${Math.floor(n.x / 10)},${Math.floor(n.z / 10)}`;
    const list = nodeBucket.get(k);
    if (list) list.push(i);
    else nodeBucket.set(k, [i]);
  });
  const nodeOf = new Int32Array(count);
  for (let c = 0; c < count; c++) {
    let best = 0;
    let bestD = Infinity;
    for (let r = 0; r <= 3 && bestD === Infinity; r++) {
      const bx = Math.floor(xs[c] / 10);
      const bz = Math.floor(zs[c] / 10);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          for (const i of nodeBucket.get(`${bx + dx},${bz + dz}`) ?? []) {
            const d = Math.hypot(nodeX[i] - xs[c], nodeZ[i] - zs[c]);
            if (d < bestD && !crossesPartition(xs[c], zs[c], nodeX[i], nodeZ[i], partitions)) {
              bestD = d;
              best = i;
            }
          }
        }
      }
    }
    nodeOf[c] = best;
  }

  return { x: Float64Array.from(xs), z: Float64Array.from(zs), links, near, bucket, count, nodeX, nodeZ, nodeAdj, nodeOf };
}

/** Celda transitable más cercana a un punto. */
export function nearestCell(grid: NavGrid, p: Point): number {
  let best = -1;
  let bestD = Infinity;
  const bx = Math.floor(p.x / 5);
  const bz = Math.floor(p.z / 5);
  for (let r = 0; r <= 8; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const j of grid.bucket.get(`${bx + dx},${bz + dz}`) ?? []) {
          const d = (grid.x[j] - p.x) ** 2 + (grid.z[j] - p.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
    }
    // Un anillo más tras encontrar candidata (la más cercana puede estar en el cubo vecino).
    if (best >= 0 && r >= 1) break;
  }
  return best;
}
