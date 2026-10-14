/** Consolidación: cuando la playa ya no espera nada, la transpaleta lleva sus palés a los muelles. (extraído de work.ts) */

import { consolidationCapacity, consolidationLane, consolidationPending, consolidationSlotPos } from '@/lib/sim/consolidation';
import type { SimDeps } from '@/lib/sim/deps';
import { nextTaskId } from '@/lib/sim/events';
import { MAX_ON_FORKS } from '@/lib/sim/handling-constants';
import { stagingPoint } from '@/lib/sim/positions';
import type { SimState } from '@/lib/sim/types';

/** Palés de la fila que la transpaleta alcanza desde el fondo: los de delante, hasta el primero que ya va en otra tarea. */
function frontOf(ids: string[], moving: Set<string>): string[] {
  const out: string[] = [];
  for (const pid of ids) {
    if (moving.has(pid)) break;
    out.push(pid);
  }
  return out;
}

/** Parte consolidada: la transpaleta recoge en la playa los palés listos y los lleva a los muelles (hasta 3 por viaje). */
export function generateConsolidation(state: SimState, deps: SimDeps) {
  // Parte consolidada: cuando no queda nada de las temperaturas de la playa por preparar, flejar o traer, la
  // transpaleta la recoge en la playa y la lleva a los muelles (hasta 3 palés por viaje).
  for (const [key, slot] of Object.entries(state.consolidation)) {
    const dk = deps.dockById.get(slot.dockId);
    const area = deps.consolidationById.get(slot.areaId);
    const lane = consolidationLane(deps, slot.laneId);
    if (!dk || !area || !lane) continue;
    const pending = consolidationPending(state, slot.dockId, area);
    if (slot.paletIds.length === 0) {
      if (!pending) delete state.consolidation[key];
      continue;
    }
    // Con la calle llena se recoge lo que haya, aunque falten palés del pedido, para que la entrega no se atasque.
    const full = slot.paletIds.length >= consolidationCapacity(lane);
    if (pending && !full) continue;
    // Mientras entra un lote en esta fila, no se recoge de ella (la entrega está colocando palés en su hueco).
    if (state.tasks.some((t) => t.kind === 'transfer' && t.consolidate === area.id && t.dockId === slot.dockId && t.state !== 'done')) continue;
    // Cada calle tiene su fila; la transpaleta llega a su fondo, que es el mismo punto mientras la fila no cambie.
    const from = consolidationSlotPos(lane, 0);
    if (state.tasks.some((t) => t.kind === 'transfer' && t.dockId === slot.dockId && !t.consolidate && t.from.x === from.x && t.from.z === from.z)) continue;
    const moving = new Set(state.tasks.filter((t) => t.kind === 'transfer' && t.state !== 'done').flatMap((t) => t.paletIds));
    const cap = MAX_ON_FORKS.transpaleta;
    const load = frontOf(slot.paletIds, moving).slice(0, cap);
    if (load.length === 0) continue;

    // Si aún caben palés en las horquillas (hasta 3), y hay otros pedidos consolidados en la misma playa
    // listos para llevar a muelles, se agrupan en el mismo viaje para descargarlos en varios muelles:
    if (load.length < cap) {
      for (const otherSlot of Object.values(state.consolidation)) {
        if (load.length >= cap) break;
        if (otherSlot.areaId !== slot.areaId || otherSlot.dockId === slot.dockId) continue;
        if (consolidationPending(state, otherSlot.dockId, area)) continue;
        load.push(...frontOf(otherSlot.paletIds, moving).slice(0, cap - load.length));
      }
    }

    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'transfer',
      machineKind: 'transpaleta',
      from: { ...from },
      to: stagingPoint(dk),
      dockId: slot.dockId,
      paletIds: load,
      duration: 3 + load.length * 0.8,
      state: 'queued',
    });
  }
}
