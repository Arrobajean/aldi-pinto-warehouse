/**
 * Manipulación de palés (coger / dejar) de las máquinas: paradas, tiempos y poses de las horquillas.
 *
 * Es una función pura de la geometría (sin THREE ni aleatoriedad): la simulación la usa para saber cuánto dura
 * cada maniobra y la escena para dibujar la misma maniobra con los mismos tiempos.
 *
 * Reglas reales que se modelan:
 * - Transpaleta ESE 533 lleva hasta 3 palés en tándem (horquillas de 3,6 m); recogepedidos y ERE, 2; la retráctil, 1.
 * - Los palés van siempre con el lado largo (1,2 m) a lo largo de las horquillas, y en el rack y en el semirremolque
 *   también (1,2 m en el sentido de entrada, 0,8 m de frente).
 * - La retráctil no avanza: saca el carro del mástil (alcance) y las horquillas suben o bajan hasta la cota del hueco.
 *   El resto de máquinas avanzan hasta el palé.
 */

import { handlingSeconds } from '@/lib/sim/handling-plan';
import { stopPalletPose } from '@/lib/sim/handling-stops';
import type { HandlingMachine } from '@/lib/sim/handling-types';
import type { SimState } from '@/lib/sim/types';

export type { Dropped, Handling, HandlingMachine, HandlingPlan, HandlingPose, PalletPose, PlanKey, Stop, StopWhere } from '@/lib/sim/handling-types';
export { CARRY_CENTER, CARRY_LIFT, FLOOR_APPROACH, FORK_REST, MAX_ON_FORKS, PALLET_LEN, PALLET_WID, REACH_MAX, STRAPPER_BELT_H, TRAILER_COLS, TRAILER_ROWS, TRANSFER_LIFT } from '@/lib/sim/handling-constants';
export { extensionFor, handlingSeconds, planHandling, poseAt } from '@/lib/sim/handling-plan';
export { stopPalletPose, stopPoint, strapperStop, tandemAt, trailerPalletPose } from '@/lib/sim/handling-stops';
export { laneOfDock, planStops } from '@/lib/sim/handling-task-stops';

/** La máquina está en el puesto de su próxima parada: empieza la maniobra (se encara al hueco y se detiene). */
export function startHandling(m: HandlingMachine): void {
  const stop = m.stops?.shift();
  if (!stop) return;
  const laden = m.carriedPalets.length > 0;
  m.handling = { stop, laden, elapsed: 0, total: handlingSeconds(m.kind, stop, laden) };
  m.heading = stop.face;
  m.status = 'working';
  m.speed = 0;
}

/** Avanza la maniobra; devuelve true al terminar (los palés ya han cambiado de manos). */
export function stepHandling(state: SimState, m: HandlingMachine, dt: number): boolean {
  const h = m.handling;
  if (!h) return true;
  h.elapsed += dt;
  m.status = 'working';
  m.speed = 0;
  if (h.elapsed < h.total) return false;
  const { stop } = h;
  if (stop.kind === 'take') {
    m.carriedPalets.push(...stop.paletIds);
  } else {
    m.dropped ??= [];
    stop.paletIds.forEach((pid, k) => {
      m.dropped!.push({ paletId: pid, pose: stopPalletPose(stop, k) });
      const p = state.paletById[pid];
      if (p) p.pos = { x: stopPalletPose(stop, k).x, z: stopPalletPose(stop, k).z };
    });
    const stopIds = new Set(stop.paletIds);
    m.carriedPalets = m.carriedPalets.filter((id) => !stopIds.has(id));
  }
  m.hasPalet = m.carriedPalets.length > 0;
  m.handling = undefined;
  return true;
}
