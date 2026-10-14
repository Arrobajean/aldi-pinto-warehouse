/** Plazas de espera del patio: identificadores, plaza libre más cercana a la garita y separación de salidas. (extraído de trucks.ts) */

import type { WarehouseLayout, YardStall } from '@/lib/layout/types';
import type { SimState } from '@/lib/sim/types';

/** Salidas de las plazas de espera hacia los muelles, escalonadas (s). */
export const STALL_EXIT_GAP = 90;

/** Fila de plazas de espera que se usa (la de z = 153 no tiene calle de acceso: queda de desbordamiento). */
const STALL_ROW_Z = 130;

/** Identificador de la plaza de espera i. */
export function stallKey(i: number): string {
  return `TP-${String(i + 1).padStart(2, '0')}`;
}

export function stallByKey(layout: WarehouseLayout, key: string | null): YardStall | null {
  if (!key) return null;
  return layout.site.truckParking.stalls[Number(key.slice(3)) - 1] ?? null;
}

/** Plazas de la fila de espera (las que se usan; la fila de desbordamiento no cuenta). */
export function waitingStallCount(layout: WarehouseLayout): number {
  return layout.site.truckParking.stalls.filter((s) => s.z === STALL_ROW_Z).length;
}

/** Plaza libre de la fila de espera más cercana a la entrada (la más al este). */
export function freeStall(state: SimState, layout: WarehouseLayout): string | null {
  const stalls = layout.site.truckParking.stalls;
  for (let i = stalls.length - 1; i >= 0; i--) {
    if (stalls[i].z !== STALL_ROW_Z) continue;
    const key = stallKey(i);
    if (!state.stallOccupancy[key]) return key;
  }
  return null;
}
