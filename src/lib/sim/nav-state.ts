/** Estado de la navegación por retícula de cada simulación: celdas, tramos, reservas y prioridades. (extraído de navigator.ts) */

import type { DistField } from '@/lib/sim/nav-distances';
import { nearestCell, type NavGrid } from '@/lib/sim/navgrid';
import type { SimState } from '@/lib/sim/types';

/** Duración de un paso de decisión (s). */
export const TU = 0.5;

/** Contadores para medir el coste (scripts de comprobación). */
export const navStats = { steps: 0, moves: 0, pushes: 0, dijkstra: 0, cancels: 0, detours: 0 };

/** Estado de la navegación de una simulación (de ejecución: no se serializa). */
export interface NavState {
  /** Celda en la que está (o de la que sale) cada máquina, y a la que va (−1 si está quieta). */
  cell: Int32Array;
  to: Int32Array;
  /** Inicio y fin del tramo en curso (s de simulación). */
  t0: Float64Array;
  t1: Float64Array;
  /** Celda de destino (−1 si está parada sin destino) y velocidad (m/s) registradas por la máquina. */
  goal: Int32Array;
  speed: Float64Array;
  /** Prioridad: crece mientras no llega al destino. */
  prio: Float64Array;
  /** Último paso de decisión ejecutado (en unidades de TU). */
  step: number;
  /** Reserva del paso siguiente: celda → máquina (−1 libre), y celdas tocadas para limpiarla. */
  next: Int32Array;
  touched: number[];
  /** Ocupación actual: celda → máquina (una máquina en un tramo ocupa la celda de salida y la de llegada). */
  occ: Int32Array;
  /** Celda elegida por cada máquina en el paso actual (−1: se queda). */
  choice: Int32Array;
  /** Pasos seguidos sin moverse teniendo destino (para buscar un desvío). */
  still: Int32Array;
  /** Mapa de desvío de cada máquina atascada (distancias evitando las paradas) y el paso en que se calculó. */
  detour: (DistField | null)[];
  detourStep: Int32Array;
  /** Último punto de destino pedido por cada máquina y su celda (para no buscarla en cada paso). */
  tgtX: Float64Array;
  tgtZ: Float64Array;
  tgtCell: Int32Array;
}

const store = new WeakMap<SimState, NavState>();

export function navState(state: SimState, grid: NavGrid): NavState {
  let n = store.get(state);
  if (!n) {
    const k = state.machines.length;
    const ns: NavState = {
      cell: new Int32Array(k),
      to: new Int32Array(k).fill(-1),
      t0: new Float64Array(k),
      t1: new Float64Array(k),
      goal: new Int32Array(k).fill(-1),
      speed: new Float64Array(k).fill(1),
      prio: new Float64Array(k),
      step: Math.floor(state.ts / TU),
      next: new Int32Array(grid.count).fill(-1),
      touched: [],
      occ: new Int32Array(grid.count).fill(-1),
      choice: new Int32Array(k).fill(-1),
      still: new Int32Array(k),
      detour: new Array(k).fill(null),
      detourStep: new Int32Array(k).fill(-1),
      tgtX: new Float64Array(k).fill(NaN),
      tgtZ: new Float64Array(k).fill(NaN),
      tgtCell: new Int32Array(k).fill(-1),
    };
    state.machines.forEach((m, i) => {
      const c = m.cell ?? nearestCell(grid, m.pos);
      m.cell = c;
      ns.cell[i] = c;
      ns.occ[c] = i;
    });
    store.set(state, ns);
    n = ns;
  }
  return n;
}
