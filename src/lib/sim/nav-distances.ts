/** Distancias por la retícula a un destino (Dijkstra inverso reanudable, con caché) y mapas de desvío. (extraído de navigator.ts) */

import { navStats, type NavState } from '@/lib/sim/nav-state';
import type { NavGrid } from '@/lib/sim/navgrid';

/** Destinos cuyo mapa de distancias se guarda (4 bytes por celda cada uno). */
const DIST_CACHE_MAX = 160;

const distCache = new WeakMap<NavGrid, Map<number, DistField>>();

/** Adyacencia de la retícula en arrays planos (CSR): vecinos de `c` en `to[off[c]..off[c + 1])`. */
interface Csr {
  off: Int32Array;
  to: Int32Array;
  w: Float64Array;
}
const csrCache = new WeakMap<NavGrid, Csr>();

function csrOf(grid: NavGrid): Csr {
  let g = csrCache.get(grid);
  if (!g) {
    const off = new Int32Array(grid.count + 1);
    for (let c = 0; c < grid.count; c++) off[c + 1] = off[c] + grid.links[c].length;
    const to = new Int32Array(off[grid.count]);
    const w = new Float64Array(off[grid.count]);
    for (let c = 0; c < grid.count; c++) {
      grid.links[c].forEach((l, i) => {
        to[off[c] + i] = l.to;
        w[off[c] + i] = l.dist;
      });
    }
    g = { off, to, w };
    csrCache.set(grid, g);
  }
  return g;
}

/**
 * Distancia real (m) por la retícula de cada celda a `goal`, sin pasar por `blocked`: Dijkstra inverso con
 * montículo, reanudable. Solo expande hasta cerrar la celda consultada y sigue desde ahí en la consulta siguiente
 * (las máquinas se acercan al destino, así que casi nunca hace falta el mapa entero). Los valores son los mismos
 * que los del Dijkstra completo.
 */
export class DistField {
  private readonly dist: Float32Array;
  private readonly closed: Uint8Array;
  private heapC: number[];
  private heapD: number[];
  constructor(
    private readonly g: Csr,
    count: number,
    goal: number,
    private readonly blocked?: Uint8Array,
  ) {
    this.dist = new Float32Array(count).fill(Infinity);
    this.closed = new Uint8Array(count);
    this.dist[goal] = 0;
    this.heapC = [goal];
    this.heapD = [0];
  }

  /** Distancia de la celda `c` al destino (Infinity si no se puede llegar). */
  get(c: number): number {
    while (!this.closed[c] && this.heapC.length > 0) this.expand();
    return this.dist[c];
  }

  /** Saca la celda más cercana del montículo, la cierra y relaja sus vecinas. */
  private expand() {
    const heapC = this.heapC;
    const heapD = this.heapD;
    const c = heapC[0];
    const dc = heapD[0];
    const lastC = heapC.pop()!;
    const lastD = heapD.pop()!;
    if (heapC.length > 0) {
      heapC[0] = lastC;
      heapD[0] = lastD;
      let i = 0;
      const n = heapC.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < n && heapD[l] < heapD[m]) m = l;
        if (r < n && heapD[r] < heapD[m]) m = r;
        if (m === i) break;
        const tc = heapC[i];
        heapC[i] = heapC[m];
        heapC[m] = tc;
        const td = heapD[i];
        heapD[i] = heapD[m];
        heapD[m] = td;
        i = m;
      }
    } else {
      // Mapa completo: se sueltan los montículos.
      this.heapC = [];
      this.heapD = [];
    }
    const dist = this.dist;
    if (dc > dist[c] || this.closed[c]) return;
    this.closed[c] = 1;
    const { off, to, w } = this.g;
    const blocked = this.blocked;
    for (let e = off[c], end = off[c + 1]; e < end; e++) {
      const v = to[e];
      if (blocked && blocked[v]) continue;
      // Redondeo a 32 bits antes de comparar y guardar (el mapa es Float32): si no, se cortaría la propagación.
      const nd = Math.fround(dc + w[e]);
      if (nd < dist[v]) {
        dist[v] = nd;
        const hc = this.heapC;
        const hd = this.heapD;
        hc.push(v);
        hd.push(nd);
        let i = hc.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (hd[p] <= hd[i]) break;
          const tc = hc[i];
          hc[i] = hc[p];
          hc[p] = tc;
          const td = hd[i];
          hd[i] = hd[p];
          hd[p] = td;
          i = p;
        }
      }
    }
  }
}

/** Distancias a `goal` por la retícula libre, con caché por destino. */
export function cellDistances(grid: NavGrid, goal: number): DistField {
  let cache = distCache.get(grid);
  if (!cache) {
    cache = new Map();
    distCache.set(grid, cache);
  }
  const hit = cache.get(goal);
  if (hit) {
    // Recién usado: al final del orden de inserción (se expulsa el más antiguo).
    cache.delete(goal);
    cache.set(goal, hit);
    return hit;
  }
  navStats.dijkstra++;
  const dist = new DistField(csrOf(grid), grid.count, goal);
  if (cache.size >= DIST_CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(goal, dist);
  return dist;
}

/**
 * Mapa de distancias a `goal` que evita las celdas de las máquinas paradas (aparcadas, trabajando o cargando): el
 * de la red no las tiene en cuenta y, como no se apartan, quien va detrás esperaría para siempre en vez de rodear.
 */
export function detourDistances(n: NavState, grid: NavGrid, a: number, goal: number): DistField {
  const blocked = new Uint8Array(grid.count);
  for (let k = 0; k < n.cell.length; k++) {
    if (k !== a && n.to[k] < 0 && (n.goal[k] < 0 || n.goal[k] === n.cell[k]) && n.cell[k] !== goal) blocked[n.cell[k]] = 1;
  }
  return new DistField(csrOf(grid), grid.count, goal, blocked);
}
