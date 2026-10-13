/**
 * Cinemática de presentación: suaviza la pose que dibuja la escena a partir de la posición y rumbo
 * que da la simulación. No altera la simulación.
 */

import { headingFor, shortestAngle } from '@/lib/sim/vehicle';

export { headingFor, shortestAngle };

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
