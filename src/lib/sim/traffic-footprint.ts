/** Huellas de los camiones (círculos a lo largo del eje) y comprobaciones de solape. (extraído de traffic.ts) */

import type { Rect } from '@/lib/layout/types';
import type { Point, Truck } from '@/lib/sim/types';

// --- Camiones ---

export const TRUCK_CIRCLE_R = 1.6;
/**
 * Centros de los círculos de la huella en el eje local (frente en −Z, trasera en +Z): cubren el modelo real,
 * de la cabina (−4,8) a las puertas del remolque (+11,6), 16,4 m.
 */
const TRUCK_CIRCLES = [-3.2, 0.3, 3.8, 7.3, 10.0];

/** Centros de la huella de un camión con origen (x, z) y rumbo `heading`. */
export function truckCircles(x: number, z: number, heading: number): Point[] {
  // Eje local +Z del camión en el mundo: (sin h, cos h).
  const sx = Math.sin(heading);
  const sz = Math.cos(heading);
  return TRUCK_CIRCLES.map((l) => ({ x: x + sx * l, z: z + sz * l }));
}

/** Holgura mínima entre las huellas de dos camiones en movimiento (m). */
export const TRUCK_MARGIN = 0.4;

/** Separación mínima entre dos conjuntos de círculos (negativa = solape). */
export function circlesGap(a: Point[], b: Point[]): number {
  let best = Infinity;
  for (const p of a) {
    for (const q of b) {
      const d = Math.hypot(p.x - q.x, p.z - q.z) - 2 * TRUCK_CIRCLE_R;
      if (d < best) best = d;
    }
  }
  return best;
}

function circleInRect(c: Point, r: number, rect: Rect): boolean {
  const cx = Math.max(rect.xMin, Math.min(c.x, rect.xMax));
  const cz = Math.max(rect.zMin, Math.min(c.z, rect.zMax));
  return (c.x - cx) ** 2 + (c.z - cz) ** 2 < r * r;
}

/** ¿Algún círculo de la huella pisa el rectángulo? */
export function footprintInRect(circles: Point[], rect: Rect): boolean {
  return circles.some((c) => circleInRect(c, TRUCK_CIRCLE_R, rect));
}

/** Camión estático fuera de los carriles: atracado o aparcado en su plaza (o fuera de la parcela). */
export function truckParked(t: Truck): boolean {
  if (t.status === 'at_dock' || t.status === 'offsite' || t.status === 'done') return true;
  if (t.status === 'parking' && t.route.length === 0) return true;
  // Esperando para salir del muelle sin haberse movido (la ruta empieza en su posición): sigue atracado.
  const r0 = t.route[0];
  return t.status === 'leaving' && t.stage === 'pullout' && r0 !== undefined && r0.x === t.pos.x && r0.z === t.pos.z;
}
