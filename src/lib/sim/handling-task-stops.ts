/** Paradas de una tarea completa en orden («coger en A, llevar, dejar en B»), por viajes de la capacidad de las horquillas. (extraído de handling.ts) */

import { faceNormal } from '@/lib/layout/dock-geometry';
import type { Dock } from '@/lib/layout/types';
import { consolidationKey, consolidationLane, consolidationSlotPos } from '@/lib/sim/consolidation';
import type { SimDeps } from '@/lib/sim/deps';
import { MAX_ON_FORKS } from '@/lib/sim/handling-constants';
import { floorStop, rackStop, strapperStop, tandemAt, trailerStop } from '@/lib/sim/handling-stops';
import type { Stop } from '@/lib/sim/handling-types';
import { workPoint } from '@/lib/sim/machine-routes';
import { stagingPoint } from '@/lib/sim/positions';
import type { Machine, Point, SimState, SimTask } from '@/lib/sim/types';

function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

function dockOf(deps: SimDeps, id: string | undefined): Dock | undefined {
  return id ? deps.layout.docks.find((d) => d.id === id) : undefined;
}

/** Calle de la playa de consolidación reservada para un muelle (en la playa `areaId`, si se indica). */
export function laneOfDock(state: SimState, deps: SimDeps, dockId: string | undefined, areaId?: string) {
  if (!dockId) return undefined;
  const slot = Object.values(state.consolidation ?? {}).find((s) => s.dockId === dockId && (!areaId || s.areaId === areaId));
  return consolidationLane(deps, slot?.laneId);
}

/** Tramos de palés de una misma calle, en el orden de la tarea, con la dirección de la calle de cada tramo. */
function laneRuns(state: SimState, deps: SimDeps, ids: string[], fallbackDir: Point) {
  const runs: { laneId: string | undefined; dir: Point; ids: string[] }[] = [];
  for (const pid of ids) {
    const laneId = Object.values(state.consolidation).find((s) => s.paletIds.includes(pid))?.laneId;
    const last = runs.at(-1);
    if (last && last.laneId === laneId) {
      last.ids.push(pid);
      continue;
    }
    const lane = consolidationLane(deps, laneId);
    runs.push({ laneId, dir: lane ? { x: lane.dirX, z: lane.dirZ } : fallbackDir, ids: [pid] });
  }
  return runs;
}

function strapperOf(deps: SimDeps, id: string | undefined) {
  return id ? deps.layout.strappers.find((s) => s.id === id) : undefined;
}

/**
 * Paradas de una tarea en orden. Cada tarea es «coger en A, llevar, dejar en B» con, como máximo, los palés que caben
 * en las horquillas por viaje (si la tarea trae más, se hacen varios viajes).
 */
export function planStops(state: SimState, deps: SimDeps, m: Machine, task: SimTask): Stop[] {
  const cap = MAX_ON_FORKS[m.kind];
  const stops: Stop[] = [];
  const dock = dockOf(deps, task.dockId);
  const out = (list: (Stop | null)[]) => {
    for (const s of list) if (s) stops.push(s);
  };

  if (task.kind === 'putaway') {
    const pid = task.paletIds[0];
    const p = state.paletById[pid];
    if (!p) return stops;
    const palletDock = dockOf(deps, p.dockId) ?? dock;
    const n = palletDock ? faceNormal(palletDock.face) : { x: 0, z: 1 };
    out([floorStop(m.kind, 'take', [pid], p.pos, n), rackStop(state, deps, task.toLocId, 'put', pid)]);
  } else if (task.kind === 'replenish') {
    const pid = task.paletIds[0];
    out([rackStop(state, deps, task.fromLocId, 'take', pid), rackStop(state, deps, task.toLocId, 'put', pid)]);
  } else if (task.kind === 'pick') {
    const station = strapperOf(deps, task.strapperId);
    for (const group of chunk(task.paletIds, cap)) {
      for (const pid of group) out([rackStop(state, deps, state.paletById[pid]?.locId, 'take', pid)]);
      if (station) {
        out([strapperStop(m.kind, 'put', group, station, !task.manual)]);
      }
    }
  } else if (task.kind === 'transfer') {
    const station = deps.layout.strappers.find((st) => Math.hypot(st.output.x - task.from.x, st.output.z - task.from.z) < 0.1);
    const n = dock ? faceNormal(dock.face) : { x: 0, z: 1 };
    const lane = laneOfDock(state, deps, task.dockId, task.consolidate);
    const laneDir = lane ? { x: lane.dirX, z: lane.dirZ } : { x: 0, z: 1 };
    // Palés ya en la fila de la playa: los nuevos se apilan detrás, en el hueco siguiente.
    const slotOfDrop = task.consolidate ? state.consolidation[consolidationKey(task.dockId ?? '', task.consolidate)] : undefined;
    let filled = slotOfDrop?.paletIds.length ?? 0;
    for (const group of chunk(task.paletIds, cap)) {
      if (station) {
        // Salida de la flejadora: se cogen directamente sobre los rodillos de la cinta
        out([strapperStop(m.kind, 'take', group, station, false)]);
      } else {
        // Playa de consolidación: la fila se recoge desde su fondo (el extremo más cercano al muelle), así que la
        // transpaleta llega por ese lado. Si el grupo trae palés de varias calles, un tramo de coger por calle.
        for (const run of laneRuns(state, deps, group, laneDir)) {
          const p0 = state.paletById[run.ids[0]];
          out([floorStop(m.kind, 'take', run.ids, p0 ? p0.pos : task.from, { x: -run.dir.x, z: -run.dir.z })]);
        }
      }
      if (task.consolidate) {
        // Entrega: la transpaleta entra por la cabecera de la calle y deja el lote en su hueco de la fila. El primero
        // que llegó queda al fondo; el último, el más cercano a la máquina, que es el que va en la parte trasera.
        if (lane && slotOfDrop) {
          const ref = consolidationSlotPos(lane, filled + group.length - 1);
          out([floorStop(m.kind, 'put', [...group].reverse(), ref, laneDir)]);
          filled += group.length;
        } else {
          out([floorStop(m.kind, 'put', group, task.to, laneDir)]);
        }
      } else {
        // Multi-muelle: agrupar los palés del viaje por su muelle de destino para dejarlos secuencialmente
        const byDock = new Map<string, string[]>();
        for (const pid of group) {
          const targetDockId = state.paletById[pid]?.dockId ?? task.dockId ?? '';
          const list = byDock.get(targetDockId) ?? [];
          list.push(pid);
          byDock.set(targetDockId, list);
        }
        for (const [targetDockId, dockGroup] of byDock) {
          const targetDock = dockOf(deps, targetDockId) ?? dock;
          if (targetDock) {
            const targetN = faceNormal(targetDock.face);
            const targetStaging = stagingPoint(targetDock);
            out([floorStop(m.kind, 'put', dockGroup, workPoint(state, deps, m.id, targetStaging, targetDock), targetN)]);
          } else {
            out([floorStop(m.kind, 'put', dockGroup, task.to, n)]);
          }
        }
      }
    }
  } else if (task.kind === 'dock_shift' && dock) {
    const truck = state.trucks.find((t) => t.dockId === dock.id && t.status === 'at_dock');
    const n = faceNormal(dock.face);
    const inbound = truck?.direction === 'inbound';
    for (const group of chunk(task.paletIds, cap)) {
      if (inbound && truck) {
        // Se descarga de las puertas hacia dentro: el primero de la tarea es el más cercano a las puertas.
        const idx = Math.max(0, truck.cargoPaletIds.indexOf(group[0]));
        out([trailerStop(truck, dock, 'take', group, idx)]);
        out([floorStop(m.kind, 'put', group, workPoint(state, deps, m.id, task.to, dock), { x: -n.x, z: -n.z })]);
      } else if (truck) {
        // Se carga de la cabeza hacia las puertas. En tándem, el palé más cercano a las puertas va en la trasera de las horquillas.
        const next = truck.cargoPaletIds.length;
        const tandem = group.length === 2 && tandemAt(next);
        const ordered = tandem ? [group[1], group[0]] : [group[0]];
        out([floorStop(m.kind, 'take', ordered, workPoint(state, deps, m.id, task.from, dock), n)]);
        out([trailerStop(truck, dock, 'put', ordered, tandem ? next + 1 : next)]);
      }
    }
  }
  return stops;
}
