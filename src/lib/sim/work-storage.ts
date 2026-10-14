/** Almacenaje en rack: putaway desde Expedición y reposición de picking desde la reserva. (extraído de work.ts) */

import type { SimDeps } from '@/lib/sim/deps';
import { nextTaskId } from '@/lib/sim/events';
import { nextRandom } from '@/lib/sim/init';
import { reserveZone } from '@/lib/sim/positions';
import { reserveLocsOfZone, skuHeightCounts } from '@/lib/sim/stock-slots';
import type { Pallet, SimState } from '@/lib/sim/types';
import { articleForSku } from '@/lib/stock/catalog';

/** Putaway: los palés en Expedición van a un hueco de suelo de picking o a la reserva en altura. */
export function generatePutaway(state: SimState, deps: SimDeps) {
  // Putaway: palets en Expedición (staging) → hueco de suelo o reserva.
  const staging = [...state.stagingQueue];
  let putawayBudget = 2;

  // Recuento de palés de cada SKU en altura (level >= 1): recorre toda la ocupación de racks, así que se
  // recalcula como mucho cada SKU_COUNT_TTL segundos (para decidir dónde ubicar basta con ese detalle).
  const skuCountsInHeight = skuHeightCounts(state);
  // Huecos de reserva (level >= 1) libres por zona, calculados una vez por pasada y solo si hacen falta.
  const reserveFree = new Map<string, string[]>();
  const freeReserve = (zone: string) => {
    let list = reserveFree.get(zone);
    if (!list) {
      list = state.freeRack.filter((loc) => {
        const slot = state.slotPos[loc];
        return slot && slot.zoneId === zone && slot.level >= 1;
      });
      reserveFree.set(zone, list);
    }
    return list;
  };
  // Palés en playa sin stock en altura (para dar prioridad a subirlos).
  const noHeight = (q: Pallet | undefined) => Boolean(q && q.state === 'staging' && (!q.sku || (skuCountsInHeight.get(q.sku) ?? 0) === 0));
  const pendingWithoutHeight = staging.filter((otherPid) => noHeight(state.paletById[otherPid])).length;

  const queuedPutaway = new Set(state.tasks.filter((t) => t.state === 'queued' && t.kind === 'putaway').map((t) => t.paletIds[0]));
  for (const pid of staging) {
    if (putawayBudget <= 0) break;
    const p = state.paletById[pid];
    if (!p || p.state !== 'staging') continue;
    if (queuedPutaway.has(pid)) continue;
    const zone = reserveZone(p.temp);
    const article = p.sku ? articleForSku(p.sku) : null;
    const inHeight = p.sku ? (skuCountsInHeight.get(p.sku) ?? 0) : 0;

    let destLoc: string | undefined;
    const freeL0List = state.freeL0ByZone[zone] ?? [];

    // Regla logística: no subir a altura productos que ya tienen stock en altura
    // Si ya tiene stock en altura y hay puestos de picking vacíos a nivel de suelo (level 0),
    // se ubica directamente en el suelo para reponer picking sin maniobras innecesarias en altura.
    if (inHeight > 0 && freeL0List.length > 0) {
      const matchAisle = article ? freeL0List.find((loc) => deps.sections.familiesOfLoc.get(loc)?.has(article.family)) : undefined;
      destLoc = matchAisle ?? freeL0List[0];
    } else if (inHeight === 0) {
      // Producto nuevo o sin stock en altura: se sube al rack de reserva (level >= 1)
      const candidates = freeReserve(zone);
      if (candidates.length > 0) {
        const ownAisles = article ? candidates.filter((loc) => deps.sections.familiesOfLoc.get(loc)?.has(article.family)) : [];
        const pool = ownAisles.length > 0 ? ownAisles : candidates;
        const sorted = [...pool].sort((a, b) => state.slotPos[b].z - state.slotPos[a].z);
        const half = article?.rotation === 'A' ? sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2))) : sorted;
        destLoc = half[Math.floor(nextRandom(state) * half.length)]!;
      }
    } else {
      // Ya tiene stock en altura y no hay suelo libre:
      // Si hay otros productos en staging sin stock en altura, se les da prioridad a ellos para subir
      const hasOtherPendingWithoutHeight = pendingWithoutHeight - (noHeight(p) ? 1 : 0) > 0;
      if (!hasOtherPendingWithoutHeight) {
        const candidates = freeReserve(zone);
        if (candidates.length > 0) {
          const ownAisles = article ? candidates.filter((loc) => deps.sections.familiesOfLoc.get(loc)?.has(article.family)) : [];
          const pool = ownAisles.length > 0 ? ownAisles : candidates;
          destLoc = pool[Math.floor(nextRandom(state) * pool.length)]!;
        }
      }
    }

    if (!destLoc) continue;
    const slotFrom = state.slotPos[destLoc];
    state.stagingQueue = state.stagingQueue.filter((x) => x !== pid);
    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'putaway',
      machineKind: 'retractil',
      from: p.pos,
      to: { x: slotFrom.x, z: slotFrom.z },
      toLocId: destLoc,
      paletIds: [pid],
      // Lo ubica una retráctil del sector de destino.
      section: zone,
      duration: 6 + nextRandom(state) * 4,
      state: 'queued',
    });
    putawayBudget--;
  }
}

/** Reposición: reserva en altura baja a picking para cada hueco de suelo vacío. */
export function generateReplenish(state: SimState) {
  // Reposición de puestos vacíos a nivel de suelo (picking): reserva en altura baja a picking.
  for (const zone of ['seco', 'frio', 'congelado'] as const) {
    const freeL0List = state.freeL0ByZone[zone];
    if (!freeL0List || freeL0List.length === 0) continue;
    const activeReplenish = state.tasks.filter((t) => t.kind === 'replenish' && t.section === zone && t.state !== 'done').length;
    if (activeReplenish >= 2) continue;
    if (state.storedByZone[zone] === 0) continue;

    const freeL0 = freeL0List[0];
    const toSlot = state.slotPos[freeL0];
    if (!toSlot) continue;

    // Producto a reponer: el que menos stock tenga en picking que tenga reserva en la zona
    const pickCount: Record<string, number> = {};
    const zoneTemp = zone === 'seco' ? 'dry' : zone === 'frio' ? 'cool' : 'frozen';
    for (const pid of state.pickingByTemp[zoneTemp]) {
      const sku = state.paletById[pid]?.sku ?? '';
      pickCount[sku] = (pickCount[sku] ?? 0) + 1;
    }

    // Reserva más cercana de cada producto (en altura, level >= 1)
    const nearestReserve = new Map<string, { loc: string; d: number }>();
    for (const loc of reserveLocsOfZone(state, zone)) {
      const pid = state.rackOccupancy[loc];
      if (!pid) continue;
      const slot = state.slotPos[loc];
      const p = state.paletById[pid];
      if (!p || p.state !== 'stored') continue;
      const d = (slot.x - toSlot.x) ** 2 + (slot.z - toSlot.z) ** 2;
      const best = nearestReserve.get(p.sku);
      if (!best || d < best.d) nearestReserve.set(p.sku, { loc, d });
    }

    let reserveEntry: string | undefined;
    let bestCount = Infinity;
    for (const [sku, cand] of nearestReserve) {
      const count = pickCount[sku] ?? 0;
      if (count < bestCount) {
        bestCount = count;
        reserveEntry = cand.loc;
      }
    }
    if (!reserveEntry) continue;

    state.freeL0ByZone[zone] = state.freeL0ByZone[zone].filter((l) => l !== freeL0);
    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'replenish',
      machineKind: 'retractil',
      from: { x: state.slotPos[reserveEntry].x, z: state.slotPos[reserveEntry].z },
      to: { x: toSlot.x, z: toSlot.z },
      fromLocId: reserveEntry,
      toLocId: freeL0,
      section: zone,
      paletIds: [state.rackOccupancy[reserveEntry]],
      duration: 5 + nextRandom(state) * 3,
      state: 'queued',
    });
  }
}
