/** Conducción de los camiones: integración de la ruta respetando el tráfico, barreras y báscula. (extraído de trucks.ts) */

import type { Rect } from '@/lib/layout/types';
import { circlesGap, truckCircles, truckParked } from '@/lib/sim/traffic-footprint';
import { STUCK_PATIENCE, truckFreeDistance, truckOverlaps } from '@/lib/sim/traffic-free';
import type { Point, SimState, Truck } from '@/lib/sim/types';
import { type BikeState, TRUCK_BIKE, TRUCK_CRUISE_V, TRUCK_REVERSE_V, followPath } from '@/lib/sim/vehicle';
import { SCALE_STOP } from '@/lib/sim/yard-routes';

/** La báscula se libera cuando el camión que salía de ella está a esta distancia (m). */
const SCALE_CLEAR_DIST = 20;
/** Espera ante cada barrera de la garita (s): el camión se detiene con la barrera cerrada y luego sigue. */
const BARRIER_WAIT_S = 5;

/** Ruta que arranca en la posición actual del camión (el primer tramo va de donde está al primer punto). */
export function fromHere(t: Truck, pts: Point[]): Point[] {
  return [{ x: t.pos.x, z: t.pos.z }, ...pts];
}

/** Pose del camión como vehículo tipo bicicleta (se escribe de vuelta tras cada paso). */
export function bikeOf(t: Truck): BikeState {
  return { x: t.pos.x, z: t.pos.z, heading: t.heading, v: t.v };
}
export function writeBack(t: Truck, b: BikeState) {
  t.pos.x = b.x;
  t.pos.z = b.z;
  t.heading = b.heading;
  t.v = b.v;
  t.speed = Math.abs(b.v);
}

/** ¿El camión tiene reservada una zona de maniobra? (dentro de ella no cuentan los vecinos atracados o aparcados) */
export function maneuvering(state: SimState, t: Truck): boolean {
  return state.zoneClaims.some((c) => c.owner === t.id && c.maneuver);
}

/**
 * Límite de velocidad por tráfico: frena para parar antes del camión de delante (huella + 4 m) o de una zona
 * reservada por otro, y reserva las zonas que va a pisar (cruces y su zona de maniobra `own`).
 */
export function trafficCap(state: SimState, t: Truck, vCap: number, reverse: boolean, own?: { id: string; rect: Rect }): number {
  // Tras STUCK_PATIENCE s parado sin poder avanzar, el conductor negocia el paso con los que también están
  // atascados: ignora sus reservas de zona y se acerca más a los demás. Rompe los bloqueos cruzados de reservas.
  const patient = t.waitTimer > STUCK_PATIENCE;
  const free = truckFreeDistance(state, t, reverse, TRUCK_BIKE.brake, maneuvering(state, t), own, undefined, patient);
  return free === Infinity ? vCap : Math.min(vCap, Math.sqrt(2 * TRUCK_BIKE.brake * Math.max(0, free - 0.5)));
}

/**
 * Avance mínimo (m) desde la última posición de referencia para dejar de contar como atascado. Con un umbral de
 * milímetros, dos camiones que se bloquean y avanzan centímetros a ratos ponían a cero su espera y nunca llegaban a
 * negociar el paso (STUCK_PATIENCE) ni a ceder el paso (ver `maybeYield`): el patio se quedaba parado para siempre.
 */
const PROGRESS_DIST = 1;
/** Posición de referencia de cada camión para medir su avance (fuera del estado: solo afecta a `waitTimer`). */
const progressAnchor = new WeakMap<Truck, { x: number; z: number }>();

/** Deshace un paso que ha creado un solape con otro camión (seguridad dura). */
export function guardStep(state: SimState, t: Truck, before: { x: number; z: number; heading: number }, overlapped: boolean, dt: number): boolean {
  // Tiempo atascado: crece mientras quiere avanzar y no avanza de verdad (lo usa la negociación del paso en traffic.ts).
  const stuck = () => {
    const anchor = progressAnchor.get(t) ?? before;
    const moved = Math.hypot(t.pos.x - anchor.x, t.pos.z - anchor.z) > PROGRESS_DIST;
    if (moved || !progressAnchor.has(t)) progressAnchor.set(t, { x: t.pos.x, z: t.pos.z });
    t.waitTimer = moved ? 0 : t.waitTimer + dt;
  };
  if (overlapped || !truckOverlaps(state, t, maneuvering(state, t))) {
    stuck();
    return false;
  }
  t.pos.x = before.x;
  t.pos.z = before.z;
  t.heading = before.heading;
  t.v = 0;
  t.speed = 0;
  stuck();
  return true;
}

/** Metros que retrocede un camión que cede el paso y segundos atascado antes de hacerlo. */
const YIELD_BACK_M = 4;
const YIELD_WAIT_S = 25;

/**
 * Cede el paso: si lleva rato atascado y está pisando (o casi) a un camión que va delante, retrocede unos metros en
 * vez de quedarse en contacto. Así el de delante puede avanzar; el paso sigue controlado por `guardStep`.
 */
function maybeYield(state: SimState, t: Truck) {
  if (t.waitTimer < YIELD_WAIT_S || (t.yieldLeft ?? 0) > 0) return;
  const mine = truckCircles(t.pos.x, t.pos.z, t.heading);
  const fx = -Math.sin(t.heading);
  const fz = -Math.cos(t.heading);
  for (const o of state.trucks) {
    if (o === t || o.status === 'offsite' || o.status === 'done' || truckParked(o)) continue;
    if (Math.abs(o.pos.x - t.pos.x) > 12 || Math.abs(o.pos.z - t.pos.z) > 12) continue;
    const ahead = (o.pos.x - t.pos.x) * fx + (o.pos.z - t.pos.z) * fz > 0;
    if (!ahead) continue;
    if (circlesGap(mine, truckCircles(o.pos.x, o.pos.z, o.heading)) < 0.8) {
      t.yieldLeft = YIELD_BACK_M;
      t.waitTimer = 0;
      return;
    }
  }
}

/** Retrocede lo que falta de `yieldLeft` en línea recta (con la misma comprobación de solapes). */
function backOff(state: SimState, t: Truck, dt: number): boolean {
  const before = { x: t.pos.x, z: t.pos.z, heading: t.heading };
  const overlapped = truckOverlaps(state, t, maneuvering(state, t));
  const len = t.yieldLeft ?? 0;
  const b = bikeOf(t);
  const path = [{ x: t.pos.x, z: t.pos.z }, { x: t.pos.x + Math.sin(t.heading) * len, z: t.pos.z + Math.cos(t.heading) * len }];
  followPath(b, path, TRUCK_REVERSE_V, true, dt, TRUCK_BIKE);
  writeBack(t, b);
  if (guardStep(state, t, before, overlapped, dt)) return false;
  const moved = Math.hypot(t.pos.x - before.x, t.pos.z - before.z);
  t.yieldLeft = Math.max(0, len - moved);
  if (t.yieldLeft <= 0.05) {
    t.yieldLeft = 0;
    t.v = 0;
    t.speed = 0;
  }
  return false;
}

/** Avanza el camión por su ruta respetando el tráfico. Devuelve true al llegar (parado en el último punto). */
export function drive(state: SimState, t: Truck, vCap: number, reverse: boolean, dt: number, own?: { id: string; rect: Rect }): boolean {
  maybeYield(state, t);
  if ((t.yieldLeft ?? 0) > 0) return backOff(state, t, dt);
  const cap = trafficCap(state, t, vCap, reverse, own);
  const before = { x: t.pos.x, z: t.pos.z, heading: t.heading };
  const overlapped = truckOverlaps(state, t, maneuvering(state, t));
  const b = bikeOf(t);
  const r = followPath(b, t.route, cap, reverse, dt, TRUCK_BIKE);
  writeBack(t, b);
  if (guardStep(state, t, before, overlapped, dt)) return false;
  if (r.done) {
    t.route = [];
    t.v = 0;
    t.speed = 0;
  }
  return r.done;
}

/** Libera la báscula cuando el camión que la ocupaba ya se ha alejado. */
export function maybeClearScale(state: SimState, t: Truck) {
  if (state.scaleTruckId !== t.id) return;
  if (Math.hypot(t.pos.x - SCALE_STOP.x, t.pos.z - SCALE_STOP.z) > SCALE_CLEAR_DIST) state.scaleTruckId = null;
}

/**
 * Avanza hasta la barrera (fin de `route`), espera BARRIER_WAIT_S con la barrera cerrada y reanuda la ruta
 * que queda en `nextRoute`.
 */
export function passBarrier(state: SimState, t: Truck, dt: number, own?: { id: string; rect: Rect }) {
  if (t.route.length > 0) {
    if (drive(state, t, TRUCK_CRUISE_V, false, dt, own)) t.dwell = BARRIER_WAIT_S;
    return;
  }
  t.dwell -= dt;
  if (t.dwell <= 0) {
    t.route = t.nextRoute;
    t.nextRoute = [];
  }
}
