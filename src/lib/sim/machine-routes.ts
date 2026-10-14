/**
 * Puestos de trabajo de las máquinas en la nave (los caminos los decide la navegación: navigator.ts).
 *
 * - Frente a un hueco: en el pasillo, desplazado hacia el rack del hueco y a la altura del hueco (no en el nodo
 *   de cabecera del pasillo, donde antes se paraban todas las que trabajaban en él).
 * - Puntos compartidos (entrada y salida de flejadora, calle de expedición, frente de muelle): bahías separadas
 *   2,5 m; cada máquina usa la primera libre. Las de las flejadoras quedan fuera del corredor que las sirve.
 */
import type { Dock } from '@/lib/layout/types';
import type { SimDeps } from '@/lib/sim/deps';
import { stagingPoint, dockInteriorPoint } from '@/lib/sim/positions';
import type { Point, SimState } from '@/lib/sim/types';

/** Puesto frente a un hueco: desplazamiento desde el eje del pasillo hacia el rack (m). */
export const SLOT_STOP_OFFSET = 1.5;
/** Separación entre bahías de un punto compartido (m). */
const BAY_STEP = 2.5;
/** Una bahía está ocupada si hay una máquina (o el destino de otra) a menos de esta distancia. */
const BAY_CLEAR = 1.6;

/** Tramo de pasillo que contiene el punto, o null (transversales, calle norte y spine no son pasillo). */
export function aisleObjAt(deps: SimDeps, x: number, z: number) {
  for (const a of deps.aisles) {
    if (Math.abs(a.xCenter - x) > 2.7) continue;
    if (z >= a.zMin && z <= a.zMax) return a;
  }
  return null;
}

export function aisleAt(deps: SimDeps, x: number, z: number): string | null {
  return aisleObjAt(deps, x, z)?.id ?? null;
}

/** ¿Hay una máquina (o el destino final de otra) cerca del punto? */
function bayTaken(state: SimState, p: Point, selfId: string): boolean {
  for (const m of state.machines) {
    if (m.id === selfId) continue;
    if (Math.hypot(m.pos.x - p.x, m.pos.z - p.z) < BAY_CLEAR) return true;
    const end = m.route[m.route.length - 1];
    if (end && Math.hypot(end.x - p.x, end.z - p.z) < BAY_CLEAR) return true;
  }
  return false;
}

/** Primera bahía libre de un punto compartido (la propia si todas están ocupadas). */
function freeBay(state: SimState, selfId: string, base: Point, dir: Point, ks: number[]): Point {
  for (const k of ks) {
    const p = { x: base.x + dir.x * k * BAY_STEP, z: base.z + dir.z * k * BAY_STEP };
    if (!bayTaken(state, p, selfId)) return p;
  }
  return base;
}

/**
 * Puesto de trabajo en un punto de la nave: bahía libre si es un punto compartido (flejadora, calle de
 * expedición o frente de muelle); el propio punto en otro caso.
 */
export function workPoint(state: SimState, deps: SimDeps, selfId: string, p: Point, dock?: Dock): Point {
  const near = (q: Point) => Math.hypot(q.x - p.x, q.z - p.z) < 0.05;
  for (const st of deps.layout.strappers) {
    if (near(st.input) || near(st.output)) return p;
  }
  if (dock && (near(stagingPoint(dock)) || near(dockInteriorPoint(dock)))) {
    const along = dock.face === 'south' ? { x: 1, z: 0 } : { x: 0, z: 1 };
    return freeBay(state, selfId, p, along, [0, 1, -1]);
  }
  return p;
}
