/** Inicio de una tarea de máquina: planifica sus paradas o, sin ellas, la ruta directa hacia el destino. (extraído de machine-tasks.ts) */

import type { SimDeps } from '@/lib/sim/deps';
import { type HandlingMachine, planStops, stopPoint } from '@/lib/sim/handling';
import { slotStop } from '@/lib/sim/machine-motion';
import { workPoint } from '@/lib/sim/machine-routes';
import type { Machine, Point, SimState, SimTask } from '@/lib/sim/types';

export function beginTask(state: SimState, deps: SimDeps, m: Machine, task: SimTask) {
  const hm = m as HandlingMachine;
  const stops = planStops(state, deps, m, task);
  hm.stops = [...stops];
  hm.handling = undefined;
  hm.dropped = [];
  hm.carriedPalets = [];
  hm.hasPalet = false;
  m.liftTarget = 0;

  if (hm.stops.length > 0) {
    const nextStop = hm.stops[0];
    task.state = 'transit';
    m.status = 'traveling';
    m.route = [stopPoint(nextStop)];
  } else {
    task.state = 'transit';
    m.liftTarget = 0;
    m.carriedPalets = [...task.paletIds];
    m.hasPalet = task.paletIds.length > 0 && task.kind !== 'pick';
    m.status = 'traveling';
    const dock = task.dockId ? deps.layout.docks.find((d) => d.id === task.dockId) : undefined;
    const locTo = task.kind === 'putaway' || task.kind === 'replenish' ? slotStop(deps, task.toLocId) : null;
    const to = locTo ?? workPoint(state, deps, m.id, task.to, dock);
    const targets: Point[] = [];
    if (task.kind === 'transfer' || task.kind === 'dock_shift') targets.push(workPoint(state, deps, m.id, task.from, dock));
    if (task.kind === 'pick') {
      for (const pid of task.paletIds) {
        const stop = slotStop(deps, state.paletById[pid]?.locId);
        if (stop) targets.push(stop);
      }
      m.hasPalet = true;
    }
    targets.push(to);
    m.route = targets;
  }
}
