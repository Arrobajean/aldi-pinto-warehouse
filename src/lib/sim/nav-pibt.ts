/** Decisión PIBT de la navegación: elige la celda del siguiente paso de cada máquina, con prioridad heredada y vuelta atrás. (extraído de navigator.ts) */

import { cellDistances, detourDistances, type DistField } from '@/lib/sim/nav-distances';
import { navStats, type NavState } from '@/lib/sim/nav-state';
import type { NavGrid } from '@/lib/sim/navgrid';

/** Pasos sin moverse tras los que una máquina busca un desvío (3 s) y vigencia de ese desvío (10 s). */
const STUCK_STEPS = 6;
const DETOUR_TTL = 20;

/** Reserva la celda `c` para el paso siguiente a la máquina `a`. */
export function reserveNext(n: NavState, a: number, c: number) {
  n.next[c] = a;
  n.touched.push(c);
}

/** ¿Choca la celda `c` (o una a menos de 1,6 m) con lo ya reservado por otra máquina para el paso siguiente? */
function nextTaken(n: NavState, grid: NavGrid, a: number, c: number): boolean {
  const taken = (k: number) => {
    const o = n.next[k];
    return o !== -1 && o !== a;
  };
  if (taken(c)) return true;
  for (const k of grid.near[c]) if (taken(k)) return true;
  return false;
}

/** Dirección de la celda `u` a la `v` en la retícula (componentes −1, 0 o 1). */
function dir(grid: NavGrid, u: number, v: number): [number, number] {
  const dx = grid.x[v] - grid.x[u];
  const dz = grid.z[v] - grid.z[u];
  return [Math.abs(dx) < 0.1 ? 0 : Math.sign(dx), Math.abs(dz) < 0.1 ? 0 : Math.sign(dz)];
}

/** Celdas de la esquina de un movimiento diagonal u→v (las dos ortogonales comunes), o [] si no es diagonal. */
export function corners(grid: NavGrid, u: number, v: number): number[] {
  const [dx, dz] = dir(grid, u, v);
  if (dx === 0 || dz === 0) return [];
  const out: number[] = [];
  for (const l of grid.links[u]) {
    const [ex, ez] = dir(grid, u, l.to);
    if ((ex === dx && ez === 0) || (ex === 0 && ez === dz)) out.push(l.to);
  }
  return out;
}

/** ¿Está la celda ocupada ahora por otra máquina? */
function occupiedByOther(n: NavState, a: number, c: number): boolean {
  const o = n.occ[c];
  return o !== -1 && o !== a;
}

/**
 * PIBT para la máquina `a`: elige su celda del paso siguiente. `parent` es la máquina que la empuja (no puede
 * ir a la celda de esta, para no intercambiarse de frente). Si la celda deseada la ocupa otra que aún no ha
 * decidido, esta hereda la prioridad y tiene que apartarse; si no puede, se prueba la siguiente opción. En
 * diagonal reserva también las dos celdas de la esquina, para que nadie se cruce por el centro.
 */
export function pibt(n: NavState, grid: NavGrid, decided: Uint8Array, a: number, parent: number): boolean {
  decided[a] = 1;
  n.choice[a] = -1;
  const here = n.cell[a];
  const goal = n.goal[a];
  // Atascada un rato: usa el mapa de desvío (que rodea a las paradas) en vez del de la red.
  let dist: DistField | null = null;
  if (goal >= 0) {
    if (n.still[a] >= STUCK_STEPS) {
      if (!n.detour[a] || n.step - n.detourStep[a] > DETOUR_TTL) {
        navStats.detours++;
        n.detour[a] = detourDistances(n, grid, a, goal);
        n.detourStep[a] = n.step;
      }
      dist = n.detour[a];
    } else dist = cellDistances(grid, goal);
  }
  // Candidatas: quedarse y las vecinas, de más cerca a más lejos del destino (si la empujan, quedarse va al final).
  const cands = [here, ...grid.links[here].map((l) => l.to)];
  const score = (c: number) => (dist ? dist.get(c) : 0) + (c === here && parent >= 0 ? 1e6 : 0);
  cands.sort((x, y) => score(x) - score(y) || x - y);
  for (const c of cands) {
    if (parent >= 0 && c === n.cell[parent]) continue;
    if (nextTaken(n, grid, a, c)) continue;
    const corner = c === here ? [] : corners(grid, here, c);
    if (corner.some((k) => occupiedByOther(n, a, k) || nextTaken(n, grid, a, k))) continue;
    reserveNext(n, a, c);
    // Mientras sale de su celda también la ocupa, salvo que ya la haya reservado quien la empuja (la seguirá).
    const leaving = c !== here && n.next[here] === -1;
    if (leaving) reserveNext(n, a, here);
    for (const k of corner) reserveNext(n, a, k);
    const b = n.occ[c];
    let ok = true;
    if (b !== -1 && b !== a) {
      if (decided[b]) ok = false;
      else {
        navStats.pushes++;
        ok = pibt(n, grid, decided, b, a);
      }
    }
    if (ok) {
      n.choice[a] = c === here ? -1 : c;
      return true;
    }
    // Vuelta atrás: se sueltan las celdas y se prueba la siguiente.
    if (n.next[c] === a) n.next[c] = -1;
    if (leaving && n.next[here] === a) n.next[here] = -1;
    for (const k of corner) if (n.next[k] === a) n.next[k] = -1;
  }
  // Ninguna sirve: se queda donde está.
  reserveNext(n, a, here);
  return false;
}
