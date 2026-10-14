/** Patio exterior: cola de la garita, garita, báscula y plazas de espera. (extraído de trucks.ts) */

import type { SimDeps } from '@/lib/sim/deps';
import { emitEvent } from '@/lib/sim/events';
import { nextRandom } from '@/lib/sim/rng';
import { releaseZones, stallZone } from '@/lib/sim/traffic-zones';
import { startApproach } from '@/lib/sim/truck-dock';
import { drive, fromHere, maybeClearScale, passBarrier } from '@/lib/sim/truck-motion';
import { STALL_EXIT_GAP, freeStall, stallByKey } from '@/lib/sim/truck-stalls';
import type { SimState, Truck } from '@/lib/sim/types';
import { TRUCK_CRUISE_V } from '@/lib/sim/vehicle';
import { GATE_STOP, SCALE_STOP, SPAWN_HEADING, TRUCK_SPAWN, atBarrier, gateRoute, stallRoute } from '@/lib/sim/yard-routes';

/** Separación mínima entre dos camiones que entran por la garita (s). */
const GATE_GAP = 60;
/** Pesaje en la báscula (s): mínimo y margen aleatorio. */
const SCALE_DWELL_MIN = 20;
const SCALE_DWELL_SPAN = 15;

/** Primer camión de la cola exterior (orden de llegada). */
function firstOffsite(state: SimState): Truck | undefined {
  return state.trucks.find((x) => x.status === 'offsite');
}

/** Cola exterior: el primer camión entra por la garita cuando no hay otro en ella (separación mínima GATE_GAP). */
export function stepOffsite(state: SimState, t: Truck) {
  // Cola exterior: entra uno a uno, con separación mínima en la garita y sin otro camión camino de la báscula.
  if (state.ts - state.lastGateAt < GATE_GAP) return;
  if (firstOffsite(state) !== t) return;
  if (state.trucks.some((x) => x.status === 'gate')) return;
  state.lastGateAt = state.ts;
  t.status = 'gate';
  t.gateAt = state.ts;
  t.pos = { ...TRUCK_SPAWN };
  t.heading = SPAWN_HEADING;
  t.v = TRUCK_CRUISE_V * 0.5;
  const gate = atBarrier(gateRoute(), GATE_STOP);
  t.route = fromHere(t, gate.route);
  t.nextRoute = gate.nextRoute;
  t.stage = 'lane';
  emitEvent(
    state,
    'truck_arrived',
    t.direction === 'inbound'
      ? `Camión ${t.plate} (proveedor ${state.paletById[t.cargoPaletIds[0]]?.family ?? '—'}) entra por la garita`
      : `Camión ${t.plate} de salida entra por la garita`,
  );
}

/** Garita: ante la barrera de entrada se detiene un rato y luego sigue hacia la báscula, o espera detrás si está ocupada. */
export function stepGate(state: SimState, t: Truck, dt: number) {
  // Barrera de entrada: se detiene ante ella y, tras BARRIER_WAIT_S, sigue hacia la báscula.
  if (t.nextRoute.length > 0) {
    passBarrier(state, t, dt);
    return;
  }
  // Camino de la báscula; si está libre, sigue hasta ella; si no, espera detrás.
  if (state.scaleTruckId === null) {
    state.scaleTruckId = t.id;
    t.status = 'scale';
    t.route = t.route.length > 0 ? [...t.route, { ...SCALE_STOP }] : fromHere(t, [{ ...SCALE_STOP }]);
    t.dwell = SCALE_DWELL_MIN + nextRandom(state) * SCALE_DWELL_SPAN;
  }
  drive(state, t, TRUCK_CRUISE_V, false, dt);
}

/** Báscula: pesa al camión y después le asigna muelle o, si no hay, una plaza de espera. */
export function stepScale(state: SimState, deps: SimDeps, t: Truck, dt: number) {
  if (t.route.length > 0) {
    if (drive(state, t, TRUCK_CRUISE_V, false, dt)) emitEvent(state, 'truck_weighted', `${t.plate} pesa en la báscula`);
    return;
  }
  t.dwell -= dt;
  if (t.dwell > 0) return;
  const dock = deps.dispatch.assignDock(state, t, deps.layout);
  if (dock) {
    startApproach(state, deps, t, dock);
    return;
  }
  const key = freeStall(state, deps.layout);
  const stall = stallByKey(deps.layout, key);
  if (key && stall) {
    state.stallOccupancy[key] = t.id;
    t.stallId = key;
    t.status = 'parking';
    t.stage = 'lane';
    t.route = fromHere(t, stallRoute(stall));
  }
}

/** Plaza de espera: espera el turno de salida (STALL_EXIT_GAP) y, si hay muelle libre, se aproxima a él. */
export function stepParking(state: SimState, deps: SimDeps, t: Truck, dt: number) {
  maybeClearScale(state, t);
  const stall = stallByKey(deps.layout, t.stallId);
  if (t.route.length > 0) {
    const own = stall && t.stallId ? { id: `M-${t.stallId}`, rect: stallZone(stall, true) } : undefined;
    if (drive(state, t, TRUCK_CRUISE_V, false, dt, own)) releaseZones(state, t, true);
    return;
  }
  t.stage = undefined;
  if (state.ts - state.lastStallExitAt < STALL_EXIT_GAP) return;
  const dock = deps.dispatch.assignDock(state, t, deps.layout);
  if (dock) startApproach(state, deps, t, dock);
}
