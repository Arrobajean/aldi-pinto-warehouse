/** Aproximación y atraque: sale de la plaza en marcha atrás si aplica, llega por el carril, da el arco y entra en marcha atrás. (extraído de trucks.ts) */

import { dockApproach } from '@/lib/layout/dock-geometry';
import type { SimDeps } from '@/lib/sim/deps';
import { truckOverlaps } from '@/lib/sim/traffic-free';
import { dockZoneOf, releaseZones, stallZone } from '@/lib/sim/traffic-zones';
import { dockTruck } from '@/lib/sim/truck-dock';
import { bikeOf, drive, fromHere, guardStep, maneuvering, maybeClearScale, trafficCap, writeBack } from '@/lib/sim/truck-motion';
import { freeStall, stallByKey } from '@/lib/sim/truck-stalls';
import type { SimState, Truck } from '@/lib/sim/types';
import { stallRoute } from '@/lib/sim/yard-routes';
import { TRUCK_APPROACH_V, TRUCK_BIKE, TRUCK_CRUISE_V, TRUCK_REVERSE_V, TRUCK_SLOW_DIST, shortestAngle, stepBike } from '@/lib/sim/vehicle';

/** Tolerancias de atraque: distancia al punto de atraque (m) y error de rumbo (rad). */
const DOCK_POS_TOL = 0.15;
const DOCK_HEADING_TOL = 0.05;
/** Segundos parado en la aproximación antes de desistir del muelle y aparcar (si hay plaza libre). */
const PARK_WAIT_S = 120;

/** Aborta la aproximación: libera el muelle reservado y las zonas del camión, y lo manda a una plaza libre. */
function divertToStall(state: SimState, deps: SimDeps, t: Truck): boolean {
  const key = freeStall(state, deps.layout);
  const stall = stallByKey(deps.layout, key);
  if (!key || !stall) return false;
  releaseZones(state, t, true);
  t.dockId = null;
  t.nextRoute = [];
  t.waitTimer = 0;
  state.stallOccupancy[key] = t.id;
  t.stallId = key;
  t.status = 'parking';
  t.stage = 'lane';
  t.route = fromHere(t, stallRoute(stall));
  return true;
}

/** Maniobra de aproximación al muelle: de la plaza o de la báscula hasta la niveladora, en marcha atrás al final. */
export function stepApproaching(state: SimState, deps: SimDeps, t: Truck, dt: number) {
  maybeClearScale(state, t);
  const dock = deps.layout.docks.find((d) => d.id === t.dockId);
  if (!dock) return;
  const a = dockApproach(dock);
  const zone = dockZoneOf(dock);
  if (t.stage === 'unpark') {
    const stall = stallByKey(deps.layout, t.stallId);
    const own = stall && t.stallId ? { id: `M-${t.stallId}`, rect: stallZone(stall, false) } : undefined;
    // No sale de la plaza mientras el muelle siga ocupado por la maniobra de otro (el que sale de él): si no, cada
    // uno retiene la zona que el otro necesita y se bloquean.
    const stillParked = t.route[0] !== undefined && t.route[0].x === t.pos.x && t.route[0].z === t.pos.z;
    if (stillParked && state.zoneClaims.some((c) => c.id === zone.id && c.owner !== t.id)) return;
    if (drive(state, t, TRUCK_REVERSE_V, true, dt, own)) {
      // Fuera de la plaza: su zona de salida ya no hace falta (la huella del camión basta para los demás).
      if (own) state.zoneClaims = state.zoneClaims.filter((c) => !(c.id === own.id && c.owner === t.id));
      if (t.stallId) delete state.stallOccupancy[t.stallId];
      t.stallId = null;
      t.route = fromHere(t, t.nextRoute);
      t.nextRoute = [];
      t.stage = 'lane';
    }
    return;
  }
  if (t.stage === 'lane' || t.stage === 'arc') {
    // Lleva demasiado parado esperando el paso (carril o muelle ocupados) y hay plaza libre: aparca en vez de esperar.
    if (t.waitTimer > PARK_WAIT_S && divertToStall(state, deps, t)) return;
    const toStart = Math.hypot(t.pos.x - a.start.x, t.pos.z - a.start.z);
    if (t.stage === 'lane' && toStart < 1.5) t.stage = 'arc';
    const cap = toStart < TRUCK_SLOW_DIST || t.stage === 'arc' ? TRUCK_APPROACH_V : TRUCK_CRUISE_V;
    if (drive(state, t, cap, false, dt, zone)) t.stage = 'reverse';
    return;
  }
  // Marcha atrás en línea recta hasta la niveladora; la corrección final alinea el rumbo.
  const cap = trafficCap(state, t, TRUCK_REVERSE_V, true, zone);
  const before = { x: t.pos.x, z: t.pos.z, heading: t.heading };
  const overlapped = truckOverlaps(state, t, maneuvering(state, t));
  const b = bikeOf(t);
  stepBike(b, a.target.x, a.target.z, cap, true, dt, TRUCK_BIKE, a.alignHeading);
  writeBack(t, b);
  if (guardStep(state, t, before, overlapped, dt)) return;
  const dist = Math.hypot(a.target.x - t.pos.x, a.target.z - t.pos.z);
  const herr = Math.abs(shortestAngle(a.alignHeading - t.heading));
  const stalled = Math.abs(t.v) < 0.02 && dist < 0.3;
  if ((dist < DOCK_POS_TOL && herr < DOCK_HEADING_TOL) || stalled) {
    t.pos = { ...a.target };
    t.heading = a.alignHeading;
    dockTruck(state, t, dock);
  }
}
