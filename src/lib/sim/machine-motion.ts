/** Movimiento de las máquinas: velocidades, desplazamiento por ruta y altura de la horquilla. (extraído de tick.ts) */
import { LEVEL_HEIGHT } from '@/lib/layout/pinto-layout';
import { type SimDeps } from '@/lib/sim/deps';
import { navigate, park } from '@/lib/sim/navigator';
import type { Machine, Point, SimState, SimTask } from '@/lib/sim/types';

export const SPEED: Record<Machine['kind'], { empty: number; load: number }> = {
  retractil: { empty: 2.3, load: 0.9 },
  frontal: { empty: 2.0, load: 1.0 },
  recogepedidos: { empty: 1.8, load: 1.4 },
  transpaleta: { empty: 1.6, load: 1.2 },
};

export function speedFor(m: Machine) {
  return m.hasPalet ? SPEED[m.kind].load : SPEED[m.kind].empty;
}

/**
 * Avanza la máquina hacia el primer punto de su ruta (la lista de destinos de su tarea) con navegación cooperativa:
 * el planificador reserva su camino en espacio-tiempo respetando el de las demás (ver navigator.ts). Devuelve true
 * cuando ha llegado al último destino.
 */
export function moveAlong(state: SimState, deps: SimDeps, m: Machine, dt: number): boolean {
  void dt;
  const me = state.machines.indexOf(m);
  if (m.route.length === 0) {
    park(state, deps.nav, m, me);
    return true;
  }
  const target = m.route[0];
  if (navigate(state, deps.nav, m, me, target, speedFor(m))) {
    m.route.shift();
    if (m.route.length === 0) {
      park(state, deps.nav, m, me);
      return true;
    }
  }
  // Los palets transportados viajan con la máquina en cada paso.
  if (m.hasPalet) {
    for (const pid of m.carriedPalets) {
      const p = state.paletById[pid];
      if (p) {
        p.pos.x = m.pos.x;
        p.pos.z = m.pos.z;
      }
    }
  }
  return false;
}

/** Puesto de trabajo frente al hueco de una ubicación (o null si no existe). */
export function slotStop(deps: SimDeps, locId: string | null | undefined): Point | null {
  return locId ? deps.slotStops.get(locId) ?? null : null;
}

/** Velocidad de subida/bajada de la horquilla, en m/s. */
export const LIFT_SPEED = 0.6;

/** Altura del hueco (0 si es suelo o no existe). */
export function slotHeight(state: SimState, locId: string | null | undefined): number {
  if (!locId) return 0;
  const slot = state.slotPos[locId];
  return slot ? slot.level * LEVEL_HEIGHT : 0;
}

/** Hueco que determina la altura de trabajo de una tarea. */
export function liftLocFor(state: SimState, task: SimTask): string | null | undefined {
  if (task.kind === 'putaway') return task.toLocId;
  if (task.kind === 'replenish') return task.fromLocId;
  return state.paletById[task.paletIds[0]]?.locId;
}
