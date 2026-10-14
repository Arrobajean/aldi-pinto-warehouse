/** Ubicaciones de reserva y recuento de palés por SKU en altura. (extraído de tick.ts) */
import type { SimState } from '@/lib/sim/types';

/** Vigencia del recuento de palés por SKU en altura (s). */
export const SKU_COUNT_TTL = 10;

export const skuCountCache = new WeakMap<SimState, { ts: number; counts: Map<string, number> }>();

export const reserveLocCache = new WeakMap<SimState['slotPos'], string[]>();

/** Ubicaciones en altura (level >= 1) del plano (se calculan una vez). */
export function reserveLocs(state: SimState): string[] {
  let list = reserveLocCache.get(state.slotPos);
  if (!list) {
    list = Object.keys(state.slotPos).filter((loc) => state.slotPos[loc].level >= 1);
    reserveLocCache.set(state.slotPos, list);
  }
  return list;
}

export const reserveZoneCache = new WeakMap<SimState['slotPos'], Map<string, string[]>>();

/** Ubicaciones en altura de una zona (se calculan una vez). */
export function reserveLocsOfZone(state: SimState, zone: string): string[] {
  let byZone = reserveZoneCache.get(state.slotPos);
  if (!byZone) {
    byZone = new Map();
    reserveZoneCache.set(state.slotPos, byZone);
  }
  let list = byZone.get(zone);
  if (!list) {
    list = reserveLocs(state).filter((loc) => state.slotPos[loc].zoneId === zone);
    byZone.set(zone, list);
  }
  return list;
}

/** Palés de cada SKU en altura (level >= 1), con caché de SKU_COUNT_TTL segundos por simulación. */
export function skuHeightCounts(state: SimState): Map<string, number> {
  const hit = skuCountCache.get(state);
  if (hit && state.ts - hit.ts < SKU_COUNT_TTL) return hit.counts;
  const counts = new Map<string, number>();
  for (const loc of reserveLocs(state)) {
    const pid = state.rackOccupancy[loc];
    if (!pid) continue;
    const sku = state.paletById[pid]?.sku;
    if (sku) counts.set(sku, (counts.get(sku) ?? 0) + 1);
  }
  skuCountCache.set(state, { ts: state.ts, counts });
  return counts;
}
