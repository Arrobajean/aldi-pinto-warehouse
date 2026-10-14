/** Distancia libre por delante de un camión y solapes, con la negociación de los que están atascados. (extraído de traffic.ts) */

import type { Rect } from '@/lib/layout/types';
import { TRUCK_MARGIN, circlesGap, footprintInRect, truckCircles, truckParked } from '@/lib/sim/traffic-footprint';
import { CROSSING_ZONES, claimManeuver, zoneBusy } from '@/lib/sim/traffic-zones';
import type { SimState, Truck } from '@/lib/sim/types';

/** Segundos parado tras los que un camión negocia el paso con otro también atascado (ignora su reserva). */
export const STUCK_PATIENCE = 45;

/** ¿Lleva el camión `id` atascado más de `s` segundos? */
function stuckFor(state: SimState, id: string, s: number): boolean {
  const o = state.trucks.find((x) => x.id === id);
  return o !== undefined && o.waitTimer > s;
}

/** Pose a `d` metros por delante a lo largo de la ruta (o en recta según el rumbo si no hay ruta). */
function poseAhead(t: Truck, d: number, reverse: boolean): { x: number; z: number; heading: number } {
  const sgn = reverse ? -1 : 1;
  let px = t.pos.x;
  let pz = t.pos.z;
  let heading = t.heading;
  let left = d;
  // La ruta empieza en el inicio del tramo actual (detrás): se avanza desde el segundo punto.
  for (let i = 1; i < t.route.length && left > 0; i++) {
    const p = t.route[i];
    const seg = Math.hypot(p.x - px, p.z - pz);
    if (seg < 1e-6) continue;
    // Rumbo del tramo: la tractora mira a −Z con rumbo 0 (en marcha atrás, al revés).
    heading = reverse ? Math.atan2(p.x - px, p.z - pz) : Math.atan2(-(p.x - px), -(p.z - pz));
    if (seg >= left) {
      px += ((p.x - px) * left) / seg;
      pz += ((p.z - pz) * left) / seg;
      left = 0;
      break;
    }
    left -= seg;
    px = p.x;
    pz = p.z;
  }
  if (left > 0 && t.route.length <= 1) {
    px += -Math.sin(heading) * sgn * left;
    pz += -Math.cos(heading) * sgn * left;
  }
  return { x: px, z: pz, heading };
}

/** Distancia de frenado a la velocidad actual con la frenada de servicio. */
function stopDistance(v: number, brake: number): number {
  return (v * v) / (2 * brake);
}

/**
 * Distancia libre por delante del camión (m) a lo largo de su ruta: hasta la huella de otro camión
 * (con +4 m si va en el mismo sentido) o hasta una zona reservada por otro. Reserva las zonas de cruce
 * que va a pisar si están libres. `ignoreParked`: dentro de su zona de maniobra, los atracados y aparcados
 * vecinos no cuentan (la maniobra está trazada para librarlos).
 */
export function truckFreeDistance(
  state: SimState,
  t: Truck,
  reverse: boolean,
  brake: number,
  ignoreParked: boolean,
  own?: { id: string; rect: Rect },
  why?: { reason: string },
  /** Lleva rato bloqueado: no respeta reservas de zona y se acerca a los demás hasta casi tocarlos. */
  patient = false,
): number {
  const horizon = stopDistance(Math.abs(t.v), brake) + 10;
  const step = 2;
  const near = state.trucks.filter((o) => {
    if (o === t || o.status === 'offsite' || o.status === 'done') return false;
    if (ignoreParked && truckParked(o)) return false;
    return Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < horizon + 40;
  });
  const myNow = truckCircles(t.pos.x, t.pos.z, t.heading);
  // El que va delante no espera al que le sigue en el mismo sentido (la distancia la guarda el de detrás). Si no, dos
  // camiones que han quedado pegados (o solapados tras el último recurso) no se separan nunca: al avanzar, la trasera
  // del de delante se acerca a la cabina del de detrás y el paso se niega a los dos.
  const sgn0 = reverse ? -1 : 1;
  const fx0 = -Math.sin(t.heading) * sgn0;
  const fz0 = -Math.cos(t.heading) * sgn0;
  const follower = (o: Truck) =>
    !reverse && !truckParked(o) && (o.pos.x - t.pos.x) * fx0 + (o.pos.z - t.pos.z) * fz0 < 0 && Math.cos(o.heading - t.heading) > 0.5;
  const nearCircles = near.filter((o) => !follower(o)).map((o) => {
    const c = truckCircles(o.pos.x, o.pos.z, o.heading);
    return { o, c, gap0: circlesGap(myNow, c) };
  });
  // Zonas ajenas en las que ya está circulando: no le impiden salir de ellas (las huellas de los demás siguen
  // contando). Un camión aún atracado o aparcado dentro de una zona ajena espera a que se libere.
  const insideNow = new Set(
    truckParked(t) ? [] : state.zoneClaims.filter((c) => c.owner !== t.id && footprintInRect(myNow, c.rect)).map((c) => c.id),
  );
  for (let s = 0; s <= horizon; s += step) {
    const pose = poseAhead(t, s, reverse);
    const mine = truckCircles(pose.x, pose.z, pose.heading);
    // Primero los camiones (no se reserva una zona si el de delante impide llegar a ella).
    for (const { o, c, gap0 } of nearCircles) {
      // Seguimiento (+4 m) solo tras un camión que va delante, en el mismo sentido y en el mismo eje
      // (no el del muelle de al lado ni el que viene detrás).
      const sgn = reverse ? -1 : 1;
      const fx = -Math.sin(pose.heading) * sgn;
      const fz = -Math.cos(pose.heading) * sgn;
      const along = (o.pos.x - pose.x) * fx + (o.pos.z - pose.z) * fz;
      const same = Math.cos(o.heading - pose.heading) > 0.5;
      const lat = Math.abs(Math.cos(pose.heading) * (o.pos.x - pose.x) - Math.sin(pose.heading) * (o.pos.z - pose.z));
      const margin = s > 0 && same && along > 0 && lat < 3 && !truckParked(o) ? 4 : patient ? 0.1 : TRUCK_MARGIN;
      const gap = circlesGap(mine, c);
      // Solo bloquea si el avance acerca las huellas (alejarse de uno demasiado próximo siempre se permite).
      if (gap < margin && gap < gap0 - 1e-6) {
        if (why) why.reason = `truck ${o.id} s=${s} margin=${margin}`;
        return Math.max(0, s - step);
      }
    }
    // Zonas: las reservadas por otro bloquean (salvo, si lleva rato atascado, las de otro también atascado); las de
    // cruce libres (y la de maniobra propia) se reservan al acercarse.
    for (const c of state.zoneClaims) {
      if (c.owner !== t.id && !insideNow.has(c.id) && footprintInRect(mine, c.rect)) {
        if (patient && stuckFor(state, c.owner, STUCK_PATIENCE)) continue;
        if (why) why.reason = `zone ${c.id} of ${c.owner} s=${s}`;
        return Math.max(0, s - step);
      }
    }
    if (!patient && s <= stopDistance(Math.abs(t.v), brake) + 4) {
      for (const z of CROSSING_ZONES) {
        if (state.zoneClaims.some((c) => c.id === z.id)) continue;
        if (!footprintInRect(mine, z.rect)) continue;
        // Si ya está dentro del cruce, la zona ocupada no le para: esperar no la vacía (los demás que están dentro
        // esperan lo mismo y el cruce se bloquea para siempre). Las huellas de los demás siguen contando.
        if (!truckParked(t) && footprintInRect(myNow, z.rect)) continue;
        if (zoneBusy(state, z.rect, t)) {
          if (why) why.reason = `busy ${z.id} s=${s}`;
          return Math.max(0, s - step);
        }
        state.zoneClaims.push({ id: z.id, owner: t.id, rect: z.rect, maneuver: false, entered: false });
      }
      if (own && footprintInRect(mine, own.rect) && !claimManeuver(state, t, own.id, own.rect)) return Math.max(0, s - step);
    }
  }
  return Infinity;
}

/** ¿La huella de `t` en su pose actual solapa la de otro camión que cuenta? */
export function truckOverlaps(state: SimState, t: Truck, ignoreParked: boolean): boolean {
  const mine = truckCircles(t.pos.x, t.pos.z, t.heading);
  for (const o of state.trucks) {
    if (o === t || o.status === 'offsite' || o.status === 'done') continue;
    if (ignoreParked && truckParked(o)) continue;
    if (Math.abs(o.pos.x - t.pos.x) > 25 || Math.abs(o.pos.z - t.pos.z) > 25) continue;
    if (circlesGap(mine, truckCircles(o.pos.x, o.pos.z, o.heading)) < 0) return true;
  }
  return false;
}
