/**
 * Camiones: llegada, garita, báscula, plazas de espera, maniobra de atraque, carga/descarga y salida.
 * La pose (`pos`, `heading`, `v`) se integra aquí con la cinemática tipo bicicleta: la escena solo la dibuja.
 */

import type { SimDeps } from '@/lib/sim/deps';
import { stepApproaching } from '@/lib/sim/truck-approach';
import { stepAtDock, stepLeaving } from '@/lib/sim/truck-dock';
import { stepGate, stepOffsite, stepParking, stepScale } from '@/lib/sim/truck-yard';
import type { SimState, Truck } from '@/lib/sim/types';
export { stallKey } from '@/lib/sim/truck-stalls';
export { spawnOutboundIfRoom, updateInboundSpawns } from '@/lib/sim/truck-spawn';
export { seedYard } from '@/lib/sim/truck-seed';

export function updateTruck(state: SimState, deps: SimDeps, t: Truck, dt: number) {
  switch (t.status) {
    case 'offsite':
      stepOffsite(state, t);
      break;
    case 'gate':
      stepGate(state, t, dt);
      break;
    case 'scale':
      stepScale(state, deps, t, dt);
      break;
    case 'parking':
      stepParking(state, deps, t, dt);
      break;
    case 'approaching':
      stepApproaching(state, deps, t, dt);
      break;
    case 'at_dock':
      stepAtDock(state, deps, t);
      break;
    case 'leaving':
      stepLeaving(state, deps, t, dt);
      break;
    case 'done':
      break;
  }
}
