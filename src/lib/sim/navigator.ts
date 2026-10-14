/**
 * Navegación de las máquinas por la retícula (navgrid.ts) con PIBT («Priority Inheritance with Backtracking»,
 * Okumura et al.), el algoritmo de referencia para flotas de almacén con tareas continuas.
 *
 * Cada paso (TU segundos), las máquinas que no están en mitad de un tramo eligen su siguiente celda por orden de
 * prioridad: la vecina que más las acerca a su destino (distancia real por la retícula). Si la celda (o una a menos
 * de 1,6 m) la ocupa otra máquina de menor prioridad que aún no ha decidido, esta hereda la prioridad y tiene que
 * apartarse; si no puede, se prueba la siguiente opción (vuelta atrás). La prioridad de una máquina crece mientras
 * no llega a su destino y se reinicia al llegar, así que nadie espera indefinidamente.
 *
 * No hay choques: dos máquinas nunca ocupan celdas a menos de 1,6 m, ni se cruzan de frente (no se intercambian
 * celdas). Las máquinas paradas (trabajando, cargando, en su plaza) no se apartan: las demás las rodean.
 */

import { corners, pibt, reserveNext } from '@/lib/sim/nav-pibt';
import { TU, navState, navStats, type NavState } from '@/lib/sim/nav-state';
import { nearestCell, type NavGrid } from '@/lib/sim/navgrid';
import type { Machine, Point, SimState } from '@/lib/sim/types';

export { navStats };

/** Separación mínima entre máquinas durante cualquier tramo (m) y muestras por tramo para comprobarla. */
const MIN_SEP = 1.5;
const SAMPLES = 8;

/** Ejecuta los pasos de decisión pendientes hasta el instante actual. */
function runSteps(state: SimState, grid: NavGrid, n: NavState) {
  const nowStep = Math.floor(state.ts / TU);
  while (n.step < nowStep) {
    n.step++;
    const tStep = n.step * TU;
    navStats.steps++;
    const k = state.machines.length;
    // Tramos terminados: la máquina queda en su celda de llegada.
    for (let a = 0; a < k; a++) {
      if (n.to[a] >= 0 && n.t1[a] <= tStep + 1e-9) {
        if (n.occ[n.cell[a]] === a) n.occ[n.cell[a]] = -1;
        n.cell[a] = n.to[a];
        n.to[a] = -1;
        n.occ[n.cell[a]] = a;
      }
    }
    for (const c of n.touched) n.next[c] = -1;
    n.touched = [];
    const decided = new Uint8Array(k);
    // No deciden: las que van a mitad de tramo (ocupan salida y llegada) y las paradas sin destino o ya en él.
    for (let a = 0; a < k; a++) {
      if (n.to[a] >= 0) {
        reserveNext(n, a, n.cell[a]);
        reserveNext(n, a, n.to[a]);
        // Un tramo diagonal lento ocupa también la esquina mientras dura (si no, otra entraría en ella).
        for (const k of corners(grid, n.cell[a], n.to[a])) reserveNext(n, a, k);
        decided[a] = 1;
      } else if (n.goal[a] < 0 || n.goal[a] === n.cell[a]) {
        reserveNext(n, a, n.cell[a]);
        decided[a] = 1;
      }
    }
    // Las que aún no han llegado ganan prioridad cada paso.
    const order: number[] = [];
    for (let a = 0; a < k; a++) {
      if (decided[a]) continue;
      n.prio[a] += 1;
      order.push(a);
    }
    order.sort((x, y) => n.prio[y] - n.prio[x] || x - y);
    for (const a of order) if (!decided[a]) pibt(n, grid, decided, a, -1);
    // Movimientos candidatos: la celda elegida si sigue reservada a su nombre (un seguidor puede haberla cedido).
    const moving = new Map<number, { to: number; t1: number }>();
    for (const a of order) {
      const link = n.choice[a] >= 0 && n.next[n.choice[a]] === a ? grid.links[n.cell[a]].find((l) => l.to === n.choice[a]) : undefined;
      if (!link) continue;
      moving.set(a, { to: link.to, t1: tStep + Math.max(1, Math.round(link.dist / (n.speed[a] * TU))) * TU });
    }
    // Validación geométrica: ningún par de máquinas a menos de MIN_SEP durante los tramos. Si dos chocan, se
    // cancela el movimiento de la de menor prioridad (se queda este paso) y se vuelve a comprobar.
    const posAt = (k: number, t: number): [number, number] => {
      const mv = moving.get(k);
      const from = n.cell[k];
      const to = mv ? mv.to : n.to[k];
      if (to < 0) return [grid.x[from], grid.z[from]];
      const t0 = mv ? tStep : n.t0[k];
      const t1 = mv ? mv.t1 : n.t1[k];
      const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
      return [grid.x[from] + (grid.x[to] - grid.x[from]) * f, grid.z[from] + (grid.z[to] - grid.z[from]) * f];
    };
    // Devuelve la máquina con la que choca (o −1).
    const clash = (a: number): number => {
      const mv = moving.get(a)!;
      for (let k = 0; k < state.machines.length; k++) {
        if (k === a) continue;
        if (Math.abs(grid.x[n.cell[k]] - grid.x[n.cell[a]]) > 8 || Math.abs(grid.z[n.cell[k]] - grid.z[n.cell[a]]) > 8) continue;
        const end = Math.max(mv.t1, moving.get(k)?.t1 ?? n.t1[k]);
        for (let i = 0; i <= SAMPLES; i++) {
          const t = tStep + ((end - tStep) * i) / SAMPLES;
          const [ax, az] = posAt(a, t);
          const [kx, kz] = posAt(k, t);
          if (Math.hypot(ax - kx, az - kz) < MIN_SEP) return k;
        }
      }
      return -1;
    };
    for (let changed = true; changed; ) {
      changed = false;
      const byLowPrio = [...moving.keys()].sort((x, y) => n.prio[x] - n.prio[y] || y - x);
      for (const a of byLowPrio) {
        const k = clash(a);
        if (k < 0) continue;
        // Se cancela a quien entra en la celda que la otra está dejando (es quien se acerca); si no, a `a`.
        const loser = moving.has(k) && moving.get(k)!.to === n.cell[a] ? k : a;
        moving.delete(loser);
        navStats.cancels++;
        changed = true;
        break;
      }
    }
    // Pasos sin moverse (para el desvío): se reinicia al moverse.
    for (const a of order) {
      if (moving.has(a)) {
        n.still[a] = 0;
        n.detour[a] = null;
      } else n.still[a]++;
    }
    // Aplicar: las que cambian de celda empiezan un tramo con la duración que da su velocidad.
    for (const [a, mv] of moving) {
      n.to[a] = mv.to;
      n.t0[a] = tStep;
      n.t1[a] = mv.t1;
      // Mientras dure el tramo, ocupa también la celda de llegada.
      n.occ[mv.to] = a;
      navStats.moves++;
    }
  }
}

/** Posición actual de la máquina `a` (interpolada si va en un tramo) y rumbo del tramo. */
function pose(grid: NavGrid, n: NavState, a: number, now: number): { x: number; z: number; heading: number | null } {
  const c = n.cell[a];
  const to = n.to[a];
  if (to < 0) return { x: grid.x[c], z: grid.z[c], heading: null };
  const f = Math.max(0, Math.min(1, (now - n.t0[a]) / (n.t1[a] - n.t0[a])));
  const dx = grid.x[to] - grid.x[c];
  const dz = grid.z[to] - grid.z[c];
  return { x: grid.x[c] + dx * f, z: grid.z[c] + dz * f, heading: Math.atan2(dx, dz) };
}

function apply(grid: NavGrid, n: NavState, m: Machine, me: number, now: number) {
  const p = pose(grid, n, me, now);
  const moved = Math.hypot(p.x - m.pos.x, p.z - m.pos.z);
  m.pos.x = p.x;
  m.pos.z = p.z;
  if (p.heading !== null) m.heading = p.heading;
  m.cell = n.cell[me];
  m.speed = moved / 0.1;
  m.status = moved > 1e-4 ? 'traveling' : 'waiting';
}

/**
 * Avanza la máquina hacia `target` (registra su destino y velocidad para los pasos de PIBT). Devuelve true cuando
 * está quieta en la celda del destino.
 */
export function navigate(state: SimState, grid: NavGrid, m: Machine, me: number, target: Point, speed: number): boolean {
  const n = navState(state, grid);
  if (n.tgtX[me] !== target.x || n.tgtZ[me] !== target.z) {
    n.tgtX[me] = target.x;
    n.tgtZ[me] = target.z;
    n.tgtCell[me] = nearestCell(grid, target);
  }
  const goal = n.tgtCell[me];
  if (n.goal[me] !== goal) {
    n.goal[me] = goal;
    n.prio[me] = 0;
  }
  n.speed[me] = Math.max(0.3, speed);
  runSteps(state, grid, n);
  apply(grid, n, m, me, state.ts);
  if (n.to[me] < 0 && n.cell[me] === goal) {
    m.pos.x = grid.x[goal];
    m.pos.z = grid.z[goal];
    return true;
  }
  return false;
}

/** La máquina se queda donde está (sin destino): no se aparta para las demás. */
export function park(state: SimState, grid: NavGrid, m: Machine, me: number) {
  const n = navState(state, grid);
  n.goal[me] = -1;
  n.prio[me] = 0;
  runSteps(state, grid, n);
  // Si aún termina un tramo, se sigue dibujando en él (sin tocar su estado: trabaja, carga o está aparcada).
  if (n.to[me] >= 0) {
    const p = pose(grid, n, me, state.ts);
    m.pos.x = p.x;
    m.pos.z = p.z;
    if (p.heading !== null) m.heading = p.heading;
  }
  m.cell = n.cell[me];
}
