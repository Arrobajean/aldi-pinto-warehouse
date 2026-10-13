/**
 * Cinemática de presentación: suaviza la pose que dibuja la escena a partir de la posición y rumbo
 * que da la simulación. No altera la simulación.
 */

/** Diferencia angular mínima entre dos rumbos, en (−π, π]. */
export function shortestAngle(d: number): number {
  let a = d % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export interface Kin {
  x: number;
  z: number;
  /** Rumbo dibujado (rotation.y del grupo). */
  heading: number;
  vx: number;
  vz: number;
}

export interface KinOpts {
  /** Velocidad máxima de dibujo (m/s). */
  maxSpeed: number;
  /** Aceleración y frenado máximos (m/s²). */
  accel: number;
  /** Velocidad angular máxima del giro (rad/s): el giro es en arco, no un salto. */
  turnRate: number;
  /** Eje frontal del modelo: +Z (maquinas) o −Z (tractora del camión). */
  frontAxis: 'pz' | 'nz';
  /** Distancia a partir de la cual la pose se recoloca de golpe (evita arrastrarse tras un salto de simulación). */
  snapDist: number;
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

export type HeadingMode = { mode: 'fixed'; h: number } | { mode: 'forward' } | { mode: 'reverse' };

/**
 * Avanza la pose un paso `dt` hacia el objetivo (tx, tz): aceleración limitada, giro en arco y
 * rumbo que sigue el movimiento (o un rumbo fijo). Devuelve la distancia recorrida en este paso.
 */
export function stepKin(k: Kin, tx: number, tz: number, heading: HeadingMode, dt: number, o: KinOpts): number {
  const dx = tx - k.x;
  const dz = tz - k.z;
  const dist = Math.hypot(dx, dz);
  if (dist > o.snapDist) {
    k.x = tx;
    k.z = tz;
    k.vx = 0;
    k.vz = 0;
  } else if (dist > 1e-6 || Math.hypot(k.vx, k.vz) > 1e-6) {
    // Velocidad deseada: la máxima, pero nunca más que la que permite frenar hasta parar en el objetivo
    // con la aceleración máxima (v = √(2·a·d)), con un margen del 10 % para no rebasarlo.
    const want = Math.min(o.maxSpeed, Math.sqrt(2 * o.accel * dist) * 0.9);
    const ux = dist > 1e-6 ? dx / dist : 0;
    const uz = dist > 1e-6 ? dz / dist : 0;
    const dvx = ux * want - k.vx;
    const dvz = uz * want - k.vz;
    const dv = Math.hypot(dvx, dvz);
    const maxDv = o.accel * dt;
    const f = dv > maxDv ? maxDv / dv : 1;
    k.vx += dvx * f;
    k.vz += dvz * f;
  }
  const step = Math.hypot(k.vx, k.vz) * dt;
  k.x += k.vx * dt;
  k.z += k.vz * dt;

  const sp = Math.hypot(k.vx, k.vz);
  let want: number;
  if (heading.mode === 'fixed') want = heading.h;
  else if (sp < 0.05) want = k.heading;
  else want = headingFor(k.vx, k.vz, o.frontAxis, heading.mode === 'reverse');
  const maxTurn = o.turnRate * dt;
  const diff = shortestAngle(want - k.heading);
  k.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
  return step;
}

/** Pose inicial sin velocidad. */
export function newKin(x: number, z: number, heading: number): Kin {
  return { x, z, heading, vx: 0, vz: 0 };
}

/** Estado de un vehículo de cuatro ruedas (presentación): referencia, rumbo y velocidad con signo. */
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

/**
 * Avanza un paso un vehículo tipo bicicleta hacia (tx, tz): persecución pura con curvatura limitada.
 * La posición avanza en la dirección del rumbo, así que no hay deslizamiento lateral ni giros instantáneos.
 * `vCap` es la velocidad máxima (m/s, positiva); `reverse` indica marcha atrás. Devuelve la distancia con signo.
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
): number {
  const dx = tx - b.x;
  const dz = tz - b.z;
  const dist = Math.hypot(dx, dz);
  // Distancia restante a lo largo del sentido de marcha: si el objetivo ya queda atrás, se detiene.
  const sgn = reverse ? -1 : 1;
  const remaining = sgn * (-Math.sin(b.heading) * dx - Math.cos(b.heading) * dz);
  // Velocidad deseada: la máxima, sin rebasar el punto con la capacidad de frenado.
  const speed = Math.min(vCap, Math.sqrt(2 * o.brake * Math.max(0, remaining)) * 0.9);
  const want = reverse ? -speed : speed;
  const dv = want - b.v;
  b.v += Math.max(-o.brake * dt, Math.min(o.accel * dt, dv));

  // Rumbo que pondría el eje de marcha hacia el objetivo (en marcha atrás, el rumbo apunta al revés).
  const ld = Math.max(dist, o.lookahead);
  const hd = headingFor(dx, dz, 'nz', reverse);
  const alpha = shortestAngle(hd - b.heading);
  const kappaMax = 1 / o.minRadius;
  const kappa = Math.max(-kappaMax, Math.min(kappaMax, (2 * Math.sin(alpha)) / ld));
  // El rumbo cambia en proporción a lo recorrido: giro en arco, nunca más rápido que el radio mínimo permite.
  b.heading += kappa * Math.abs(b.v) * dt;
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
