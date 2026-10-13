import type { Dock, DockFace } from '@/lib/layout/types';

/**
 * Geometría de los muelles en L. Cada muelle está en una cara exterior de la nave:
 * - 'south': fachada sur (z = 80), la coordenada u es x.
 * - 'east': fachada este (x = 125), la coordenada u es z.
 * En ambas, v es la coordenada perpendicular a la fachada (z para el sur, x para el este).
 */

/** Plano exterior de cada cara con muelles (m). */
export const FACE_V: Record<DockFace, number> = { south: 80, east: 125 };

/** Paso entre centros de muelles contiguos (m): remolque de 2,55 m y 2,25 m libres entre remolques. */
export const DOCK_PITCH = 4.8;

/** Profundidad hacia el interior de la nave (m) de los puntos de cada calle, medida desde la fachada. */
export const LANE_DEPTH = {
  south: { node: 20, stage: 22 },
  east: { node: 12, stage: 12 },
} as const;

/** Punto interior del frente de cada muelle (nodo 'dock-<id>'). */
export const INTERIOR_DEPTH = 2;

/** Pasillo de servicio del tramo este (x = 110): une las calles en batería con el spine de z = 47. */
export const EAST_CORRIDOR_X = FACE_V.east - 15;

/** Mitad del ancho de cada puerta (3 m). */
export const DOOR_HALF = 1.5;

/** Punto (x, z) de las coordenadas (u, v) de una cara. */
export function faceXZ(face: DockFace, u: number, v: number): { x: number; z: number } {
  return face === 'south' ? { x: u, z: v } : { x: v, z: u };
}

/** Coordenada u (a lo largo de la fachada) del centro de un muelle. */
export function dockU(dock: Pick<Dock, 'face' | 'x' | 'z'>): number {
  return dock.face === 'south' ? dock.x : dock.z;
}

/** Punto dentro de la nave: desplazado `lateral` a lo largo de la fachada y `depth` metros hacia dentro. */
export function dockPoint(dock: Pick<Dock, 'face' | 'x' | 'z'>, lateral: number, depth: number): { x: number; z: number } {
  return faceXZ(dock.face, dockU(dock) + lateral, FACE_V[dock.face] - depth);
}

/** Normal exterior de la cara (hacia el patio o hacia el este). */
export function faceNormal(face: DockFace): { x: number; z: number } {
  return face === 'south' ? { x: 0, z: 1 } : { x: 1, z: 0 };
}
