/** Zonas exclusivas del patio: maniobra de muelles y plazas, cruces fijos y reservas de camiones. (extraído de traffic.ts) */

import { DOCK_TURN_RADIUS, FACE_V, dockApproach, dockU } from '@/lib/layout/dock-geometry';
import type { Dock, Rect, YardStall } from '@/lib/layout/types';
import { footprintInRect, truckCircles, truckParked } from '@/lib/sim/traffic-footprint';
import type { Point, SimState, Truck } from '@/lib/sim/types';

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.xMin < b.xMax && b.xMin < a.xMax && a.zMin < b.zMax && b.zMin < a.zMax;
}

/** Zona de maniobra de un muelle: arco, marcha atrás y salida (cubre ambos carriles del patio). */
export function dockZone(dock: Dock): Rect {
  const u = dockU(dock);
  if (dock.face === 'south') return { xMin: u - 3, xMax: u + 15, zMin: 82, zMax: 126 };
  return { xMin: FACE_V.east, xMax: FACE_V.east + 47, zMin: u - 3, zMax: u + 15 };
}

/** Zona de maniobra de una plaza de espera: entrada de frente (`enter`) o salida en marcha atrás. */
export function stallZone(stall: YardStall, enter: boolean): Rect {
  const sx = stall.x + stall.width / 2;
  // La salida en marcha atrás barre z ≈ 112…135 (carril de salida incluido): la zona empieza en z = 110, fuera de
  // los remolques atracados en los muelles sur (hasta z ≈ 106), que si no quedarían «dentro» de ella.
  return enter ? { xMin: sx - 3, xMax: sx + 15, zMin: 98, zMax: 150 } : { xMin: sx - 28, xMax: sx + 3, zMin: 110, zMax: 150 };
}

/** Carril de salida del patio este (fachada + 43,6), norte-sur. */
const EAST_EXIT_X = FACE_V.east + 31.1 + DOCK_TURN_RADIUS;

/**
 * Zonas de cruce fijas: distribuidor (bajada de la báscula y carriles norte con el carril de salida sur, y la
 * incorporación del bucle), incorporación de la salida este y cruce de la garita.
 */
export const CROSSING_ZONES: { id: string; rect: Rect }[] = [
  // No alcanza la báscula (z = 150) ni el carril de salida este: quien pesa o sale por el este no la reserva.
  { id: 'X-distribuidor', rect: { xMin: 130, xMax: EAST_EXIT_X - 2.5, zMin: 98, zMax: 146 } },
  // Esquina de salida (x = 209) y su barrera: la entrada (z = 178) va 8 m al sur y no la cruza.
  { id: 'X-garita', rect: { xMin: 203, xMax: 226, zMin: 150, zMax: 172 } },
  // Incorporación del carril de salida este al carril de salida sur (z = 117,5).
  { id: 'X-salida', rect: { xMin: EAST_EXIT_X - 4, xMax: EAST_EXIT_X + 22, zMin: 96, zMax: 124 } },
];

/** Reservas activas: zona → camión. */
export interface ZoneClaim {
  id: string;
  owner: string;
  rect: Rect;
  /** Zona de maniobra (las de cruce son fijas). */
  maneuver: boolean;
  /** La huella del dueño ya ha pisado la zona (antes de eso la reserva no caduca). */
  entered: boolean;
}

/** ¿Hay otro camión en movimiento (no estático) que pise la zona? */
export function zoneBusy(state: SimState, rect: Rect, self: Truck): boolean {
  for (const o of state.trucks) {
    if (o === self || truckParked(o)) continue;
    // El camión que pesa en la báscula está quieto fuera de los carriles de paso.
    if (o.status === 'scale' && o.route.length === 0) continue;
    if (footprintInRect(truckCircles(o.pos.x, o.pos.z, o.heading), rect)) return true;
  }
  return false;
}

/** Intenta reservar una zona de maniobra para `t`. Las activas no se pueden solapar. */
export function claimManeuver(state: SimState, t: Truck, id: string, rect: Rect): boolean {
  const mine = state.zoneClaims.find((c) => c.id === id);
  if (mine) return mine.owner === t.id;
  for (const c of state.zoneClaims) {
    if (c.owner !== t.id && rectsOverlap(c.rect, rect)) return false;
  }
  if (zoneBusy(state, rect, t)) return false;
  state.zoneClaims.push({ id, owner: t.id, rect, maneuver: true, entered: false });
  return true;
}

/** Libera las zonas de `t` que su huella ya ha pisado y ha dejado atrás (o todas, con `all`). */
export function releaseZones(state: SimState, t: Truck, all = false) {
  const circles = truckCircles(t.pos.x, t.pos.z, t.heading);
  state.zoneClaims = state.zoneClaims.filter((c) => {
    if (c.owner !== t.id) return true;
    if (all) return false;
    const inside = footprintInRect(circles, c.rect);
    if (inside) c.entered = true;
    return inside || !c.entered;
  });
}

/** Zona de maniobra de un muelle y su identificador. */
export function dockZoneOf(dock: Dock): { id: string; rect: Rect } {
  return { id: `M-${dock.id}`, rect: dockZone(dock) };
}

/** Punto de inicio de la maniobra de atraque (para decidir cuándo reservar la zona). */
export function dockStart(dock: Dock): Point {
  return dockApproach(dock).start;
}
