import type { Point } from '@/lib/sim/types';
import type { Dock, WarehouseLayout } from '@/lib/layout/types';
import type { ZoneId } from '@/lib/types';
import { forEachRackSlot } from '@/lib/layout/pinto-layout';

export const RACK_ZONE_OF_TEMP: Record<'dry' | 'cool' | 'frozen', 'seco' | 'frio' | 'congelado'> = {
  dry: 'seco',
  cool: 'frio',
  frozen: 'congelado',
};

/** Construye el índice de posiciones de todas las ubicaciones de rack. */
export function buildSlotPositions(layout: WarehouseLayout) {
  const slotPos: Record<string, { x: number; y: number; z: number; zoneId: ZoneId; level: number }> = {};
  forEachRackSlot(layout, (slot) => {
    slotPos[slot.locationId] = { x: slot.x, y: slot.y, z: slot.z, zoneId: slot.zoneId, level: slot.level };
  });
  return slotPos;
}

/** Zona de reserva (nivel 1+) para una categoría térmica. */
export function reserveZone(temp: 'dry' | 'cool' | 'frozen'): 'seco' | 'frio' | 'congelado' {
  return RACK_ZONE_OF_TEMP[temp];
}

/** Punto de recogida/entrega de palets en Expedición (frente de la calle de un muelle). */
export function stagingPoint(dock: Dock): Point {
  return { x: dock.x, z: 58 };
}

/** Frente interior de un muelle (lado nave). */
export function dockInteriorPoint(dock: Dock): Point {
  return { x: dock.x, z: 78 };
}

/** En el aparcamiento de semirremolques (espera de muelle). */
export function parkPoint(dockIndex: number): Point {
  const row = dockIndex % 2 === 0 ? 140 : 152;
  const x = (dockIndex % 20) * 6 + (-60);
  return { x, z: row };
}

/** Fuera de la parcela: punto de generación de camiones. */
export const KEEP_OUT: Point = { x: 235, z: 178 };