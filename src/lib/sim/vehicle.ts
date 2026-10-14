/**
 * Cinemática de los camiones (matemática pura, sin three): modelo tipo bicicleta con radio de giro mínimo.
 * La simulación es la única fuente de verdad de la pose del camión; la escena solo la dibuja.
 */
import type { Point } from '@/lib/sim/types';

/** Diferencia angular mínima entre dos rumbos, en (−π, π]. */
export function shortestAngle(d: number): number {
  let a = d % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Rumbo que hace que el frente del modelo mire hacia (vx, vz).
 * Con frente +Z: front = (sin h, cos h). Con frente −Z: front = (−sin h, −cos h).
 */
export function headingFor(vx: number, vz: number, frontAxis: 'pz' | 'nz', reverse: boolean): number {
  const sx = reverse ? -vx : vx;
  const sz = reverse ? -vz : vz;
  return frontAxis === 'pz' ? Math.atan2(sx, sz) : Math.atan2(-sx, -sz);
}

/** Estado de un vehículo de cuatro ruedas: referencia, rumbo y velocidad con signo. */
export interface BikeState {
  x: number;
  z: number;
  /** Rumbo (rotation.y). Con rumbo 0 el frente (tractora) mira a −Z: avance = (−sin h, −cos h). */
  heading: number;
  /** Velocidad con signo: positiva avanza, negativa marcha atrás. */
  v: number;
}

export interface BikeOpts {
  /** Radio de giro mínimo (m): la curvatura nunca supera 1/minRadius. */
  minRadius: number;
  /** Aceleración y frenado máximos (m/s²). */
  accel: number;
  brake: number;
  /** Distancia mínima de anticipación del seguimiento (m). */
  lookahead: number;
}

// --- Valores del camión (único sitio) ---

/** Crucero en el patio (≈ 23 km/h). */
export const TRUCK_CRUISE_V = 6.5;
/** Curvas de los carriles del patio. */
export const TRUCK_CURVE_V = 3.5;
/** Aproximación: a menos de TRUCK_SLOW_DIST del inicio del arco de atraque. */
export const TRUCK_APPROACH_V = 3.0;
export const TRUCK_SLOW_DIST = 30;
/** Arco de giro hacia el muelle o la plaza. */
export const TRUCK_ARC_V = 2.5;
/** Marcha atrás (≈ 5 km/h). */
export const TRUCK_REVERSE_V = 1.4;
/** Radio de giro mínimo de un tractocamión de 16,5 m. */
export const TRUCK_MIN_RADIUS = 12.5;
export const TRUCK_BIKE: BikeOpts = { minRadius: TRUCK_MIN_RADIUS, accel: 1.8, brake: 3.0, lookahead: 4.0 };

/**
 * Avanza un paso un vehículo tipo bicicleta hacia (tx, tz): persecución pura con curvatura limitada.
 * La posición avanza en la dirección del rumbo, así que no hay deslizamiento lateral ni giros instantáneos.
 * `vCap` es la velocidad máxima (m/s, positiva); `reverse` indica marcha atrás. `remaining` (opcional) es la
 * distancia que queda hasta parar (por defecto, la del objetivo a lo largo del rumbo). Devuelve la distancia con signo.
 */
export function stepBike(
  b: BikeState,
  tx: number,
  tz: number,
  vCap: number,
  reverse: boolean,
  dt: number,
  o: BikeOpts,
  alignTo?: number,
  remaining?: number,
): number {
  const dx = tx - b.x;
  const dz = tz - b.z;
  const dist = Math.hypot(dx, dz);
  // Distancia restante a lo largo del sentido de marcha: si el objetivo ya queda atrás, se detiene.
  const sgn = reverse ? -1 : 1;
  const ahead = remaining ?? sgn * (-Math.sin(b.heading) * dx - Math.cos(b.heading) * dz);
  // Velocidad deseada: la máxima, sin rebasar el punto con la capacidad de frenado.
  const speed = Math.min(vCap, Math.sqrt(2 * o.brake * Math.max(0, ahead)) * 0.9);
  const want = reverse ? -speed : speed;
  const dv = want - b.v;
  b.v += Math.max(-o.brake * dt, Math.min(o.accel * dt, dv));

  // Rumbo que pondría el eje de marcha hacia el objetivo (en marcha atrás, el rumbo apunta al revés).
  const ld = Math.max(dist, o.lookahead);
  if (dist > 1e-6) {
    const hd = headingFor(dx, dz, 'nz', reverse);
    const alpha = shortestAngle(hd - b.heading);
    const kappaMax = 1 / o.minRadius;
    const kappa = Math.max(-kappaMax, Math.min(kappaMax, (2 * Math.sin(alpha)) / ld));
    // El rumbo cambia en proporción a lo recorrido: giro en arco, nunca más rápido que el radio mínimo permite.
    b.heading += kappa * Math.abs(b.v) * dt;
  }
  // Corrección final suave: a menos de 3 m del destino el rumbo se alinea con el de la pose de atraque,
  // sin pasar nunca de la curvatura mínima (|v|/R), así que solo gira mientras el vehículo se mueve.
  if (alignTo !== undefined && dist < 3) {
    const e = shortestAngle(alignTo - b.heading);
    const maxTurn = (Math.abs(b.v) / o.minRadius) * dt;
    b.heading += Math.max(-maxTurn, Math.min(maxTurn, e));
  }

  const step = b.v * dt;
  b.x += -Math.sin(b.heading) * step;
  b.z += -Math.cos(b.heading) * step;
  return step;
}

/** Longitud de una polilínea que empieza en `from`. */
export function pathLength(from: Point, path: Point[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return len;
}

/**
 * Sigue una polilínea con persecución pura sobre el tramo: `path[0]` es el inicio del tramo actual (detrás del
 * vehículo) y los demás puntos van por delante; los tramos se consumen al pasarlos. El objetivo es el punto de la
 * polilínea a la distancia de anticipación por delante de la proyección del vehículo, así que el vehículo vuelve
 * al carril si se ha desviado. La velocidad se limita en las curvas (según la curvatura de los puntos próximos) y
 * frena para parar en el último punto. Devuelve la distancia recorrida con signo y si ha llegado (parado al final).
 */
export function followPath(
  b: BikeState,
  path: Point[],
  vCap: number,
  reverse: boolean,
  dt: number,
  o: BikeOpts = TRUCK_BIKE,
): { moved: number; done: boolean } {
  if (path.length === 0) {
    b.v = 0;
    return { moved: 0, done: true };
  }
  const sgn = reverse ? -1 : 1;
  const fx = -Math.sin(b.heading) * sgn;
  const fz = -Math.cos(b.heading) * sgn;

  // Consumir los tramos ya rebasados: proyección del vehículo más allá del final del tramo.
  let t = 0;
  while (path.length >= 2) {
    const a = path[0];
    const c = path[1];
    const sx = c.x - a.x;
    const sz = c.z - a.z;
    const l2 = sx * sx + sz * sz;
    t = l2 > 1e-9 ? ((b.x - a.x) * sx + (b.z - a.z) * sz) / l2 : 1;
    if (t >= 1) path.shift();
    else break;
  }

  let goal: Point;
  let remaining: number;
  if (path.length === 1) {
    // Último punto: se va directo y cuenta la distancia a lo largo de la marcha (si se pasa de largo, para).
    goal = path[0];
    remaining = (goal.x - b.x) * fx + (goal.z - b.z) * fz;
  } else {
    const a = path[0];
    const c = path[1];
    const tc = Math.max(0, t);
    const proj = { x: a.x + (c.x - a.x) * tc, z: a.z + (c.z - a.z) * tc };
    // Punto objetivo: avanzar la anticipación por la polilínea desde la proyección.
    const look = o.lookahead + Math.abs(b.v) * 0.8;
    let left = look;
    let from = proj;
    goal = path[path.length - 1];
    for (let i = 1; i < path.length; i++) {
      const p = path[i];
      const seg = Math.hypot(p.x - from.x, p.z - from.z);
      if (seg >= left) {
        const f = left / seg;
        goal = { x: from.x + (p.x - from.x) * f, z: from.z + (p.z - from.z) * f };
        break;
      }
      left -= seg;
      from = p;
    }
    remaining = pathLength(proj, path.slice(1));
  }

  // Límite por curvatura de los puntos próximos: v² ≤ vCurva² + 2·frenada·distancia.
  let cap = vCap;
  let acc = 0;
  let prev: Point = b;
  for (let i = 1; i < path.length - 1 && acc < 25; i++) {
    const p = path[i];
    const n = path[i + 1];
    const seg = Math.hypot(p.x - prev.x, p.z - prev.z);
    acc += seg;
    const q = path[i - 1];
    const a1 = Math.atan2(p.z - q.z, p.x - q.x);
    const a2 = Math.atan2(n.z - p.z, n.x - p.x);
    const turn = Math.abs(shortestAngle(a2 - a1));
    const len = Math.max(0.5, Math.min(Math.hypot(p.x - q.x, p.z - q.z), Math.hypot(n.x - p.x, n.z - p.z)));
    const kappa = turn / len;
    if (kappa > 1 / 60) {
      const vc = kappa > 1 / 13.5 ? TRUCK_ARC_V : TRUCK_CURVE_V;
      cap = Math.min(cap, Math.sqrt(vc * vc + 2 * o.brake * acc));
    }
    prev = p;
  }

  const moved = stepBike(b, goal.x, goal.z, cap, reverse, dt, o, undefined, remaining);
  const done = path.length === 1 && remaining < 0.3 && Math.abs(b.v) < 0.1;
  return { moved, done };
}
