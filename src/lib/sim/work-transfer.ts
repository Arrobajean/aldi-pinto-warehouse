/** Transferencias: los lotes flejados salen de la flejadora hacia su playa de consolidación o directos a los muelles. (extraído de work.ts) */

import { claimConsolidationLane, consolidationAreaFor, consolidationRoom, rowBusy } from '@/lib/sim/consolidation';
import type { SimDeps } from '@/lib/sim/deps';
import { nextTaskId } from '@/lib/sim/events';
import { MAX_ON_FORKS } from '@/lib/sim/handling-constants';
import { stagingPoint } from '@/lib/sim/positions';
import { COLD_SECTION } from '@/lib/sim/sections';
import { advanceStrapper, strapperById } from '@/lib/sim/strappers';
import type { SimState } from '@/lib/sim/types';

/** Transferencias de la flejadora: cada lote va a su playa de consolidación o, sin playa, a la calle del muelle. */
export function generateTransfers(state: SimState, deps: SimDeps) {
  // Transferencia: los lotes ya flejados salen de la flejadora y van a su playa de consolidación (frío: el preparador
  // de frío; seco y congelado: la ESE) o, sin playa, directos a la calle del muelle con la ESE.
  for (const st of state.strappers) advanceStrapper(state, deps, st);
  // Transferencias abiertas por muelle y playa (una a la vez por pareja) y calles de playa ya reservadas.
  const transferKey = (dockId: string | undefined, area: string | undefined) => `${dockId}|${area ?? ''}`;
  const openTransfers = new Set(state.tasks.filter((t) => t.kind === 'transfer').map((t) => transferKey(t.dockId, t.consolidate)));
  const usedLanes = new Set(Object.values(state.consolidation).map((c) => c.laneId));
  // Los lotes no van directos al muelle: cada uno va a la playa de consolidación de su temperatura (seco; frío y
  // congelado), a la calle reservada para su pedido, y de allí al muelle cuando su parte del pedido está completa.
  // Si no hay playa para esa temperatura (o no le queda calle libre), va directo al muelle.
  for (const entry of [...state.strapOut]) {
    const temp = state.paletById[entry.paletIds[0]]?.temp ?? 'dry';
    const area = consolidationAreaFor(deps, temp);
    const toArea = area && claimConsolidationLane(state, area, entry.dockId, usedLanes) ? area : undefined;
    if (openTransfers.has(transferKey(entry.dockId, toArea?.id))) continue;
    const dk = deps.dockById.get(entry.dockId);
    if (!dk) continue;
    // Frío flejado a consolidación: lo lleva el preparador de frío (2 palés por viaje). El resto, la transpaleta ESE
    // (hasta 3 palés por viaje, horquillas extra-largas de 3,6 m).
    const byPicker = toArea !== undefined && temp === 'cool';
    const cap = byPicker ? MAX_ON_FORKS.recogepedidos : MAX_ON_FORKS.transpaleta;
    // La calle de la playa solo admite los palés que caben: el resto del lote espera en la flejadora hasta que
    // la transpaleta saque palés de la fila.
    const room = toArea ? consolidationRoom(state, toArea, entry.dockId) : Infinity;
    if (room <= 0 || (toArea && rowBusy(state, entry.dockId, toArea.id))) continue;
    const take = Math.min(cap, room);
    const load = [...entry.paletIds.slice(0, take)];
    entry.paletIds = entry.paletIds.slice(take);
    if (entry.paletIds.length === 0) state.strapOut = state.strapOut.filter((e) => e !== entry);

    // Si aún caben palés en las horquillas de la transpaleta (hasta 3) y van directos a muelles,
    // se agrupan otros lotes listos en la salida de la misma flejadora para repartirlos en varios muelles:
    if (!toArea && load.length < cap) {
      for (const other of [...state.strapOut]) {
        if (load.length >= cap) break;
        if (other.strapperId !== entry.strapperId) continue;
        const otherTemp = state.paletById[other.paletIds[0]]?.temp ?? 'dry';
        const otherArea = consolidationAreaFor(deps, otherTemp);
        const otherToArea = otherArea && claimConsolidationLane(state, otherArea, other.dockId, usedLanes) ? otherArea : undefined;
        if (otherToArea) continue; // este lote va a consolidación, no a muelle
        const needed = cap - load.length;
        const extra = other.paletIds.slice(0, needed);
        other.paletIds = other.paletIds.slice(needed);
        load.push(...extra);
        if (other.paletIds.length === 0) state.strapOut = state.strapOut.filter((e) => e !== other);
      }
    }

    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'transfer',
      machineKind: byPicker ? 'recogepedidos' : 'transpaleta',
      from: { ...(strapperById(deps, entry.strapperId)?.output ?? { x: 0, z: 47 }) },
      to: toArea ? { ...toArea.dropPoint } : stagingPoint(dk),
      dockId: entry.dockId,
      paletIds: load,
      duration: 3 + load.length * 0.8,
      consolidate: toArea?.id,
      ...(byPicker ? { section: COLD_SECTION } : {}),
      state: 'queued',
    });
    openTransfers.add(transferKey(entry.dockId, toArea?.id));
  }
}
