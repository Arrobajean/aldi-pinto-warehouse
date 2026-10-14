import type { Dock, WarehouseLayout } from '@/lib/layout/types';
import type { Machine, SimState, SimTask, Truck } from '@/lib/sim/types';

/** Política de despacho intercambiable (F12 añade la versión optimizada). */
export interface DispatchPolicy {
  /** Asigna muelle a un camión que espera aparcado. */
  assignDock(state: SimState, truck: Truck, layout: WarehouseLayout): Dock | null;
  /** Asigna una tarea encolada a una máquina libre de tipo compatible. */
  assignTask(state: SimState, machine: Machine): boolean;
}

function dockMatches(dock: Dock, truck: Truck): boolean {
  // Frío y congelado comparten muelles: un camión de frío puede atracar en un muelle de congelado y al revés.
  const frio = (t: Dock['temp']) => t !== 'dry';
  if (dock.temp !== truck.temp && !(frio(dock.temp) && frio(truck.temp))) return false;
  if (truck.direction === 'inbound') {
    // Entrada por los muelles de proveedores (seco) y por los mixtos de frío y congelado (todos aceptan entrada y
    // salida). Los de salida no: el seco usaba antes D01–D04, que son muelles de pedidos de tienda.
    return dock.kind !== 'outbound';
  }
  // Salida: muelles de salida y mixtos.
  return dock.kind !== 'inbound';
}

/**
 * Tareas en cola por tipo de máquina, calculadas una vez por paso (la lista de tareas y el instante no cambian
 * mientras se reparten). Cada asignación se vuelve a comprobar (estado y máquina) al elegir.
 */
const queuedCache = new WeakMap<SimState, { tasks: SimTask[]; length: number; ts: number; byKind: Map<string, SimTask[]> }>();

function queuedByKind(state: SimState): Map<string, SimTask[]> {
  const hit = queuedCache.get(state);
  if (hit && hit.tasks === state.tasks && hit.length === state.tasks.length && hit.ts === state.ts) return hit.byKind;
  const byKind = new Map<string, SimTask[]>();
  for (const t of state.tasks) {
    if (t.state !== 'queued') continue;
    const list = byKind.get(t.machineKind);
    if (list) list.push(t);
    else byKind.set(t.machineKind, [t]);
  }
  queuedCache.set(state, { tasks: state.tasks, length: state.tasks.length, ts: state.ts, byKind });
  return byKind;
}

export const simpleDispatch: DispatchPolicy = {
  assignDock(state, truck, layout) {
    // Se asigna al salir de la báscula o desde una plaza de espera.
    if (truck.status !== 'parking' && truck.status !== 'scale') return null;
    // Un muelle queda reservado desde que se asigna al camión (no solo al atracar).
    const busy = new Set([
      ...state.dockStates.filter((d) => d.truckId !== null).map((d) => d.dockId),
      ...state.trucks.filter((t) => t.dockId !== null && t.status !== 'leaving').map((t) => t.dockId as string),
    ]);
    const preferId = truck.orderId
      ? state.demand.orders.find((o) => o.id === truck.orderId)?.dockId
      : undefined;
    // Un camión de salida solo atraca en el muelle de su pedido: sus palés están en la calle de ese muelle y en otro
    // no podría cargar (se quedaba atracado para siempre). Si está ocupado, espera en una plaza.
    if (preferId) {
      const dock = layout.docks.find((d) => d.id === preferId);
      return dock && !busy.has(dock.id) && dockMatches(dock, truck) ? dock : null;
    }
    // Entrada: el primer muelle libre válido.
    return layout.docks.find((dock) => !busy.has(dock.id) && dockMatches(dock, truck)) ?? null;
  },

  assignTask(state, machine) {
    if (machine.status === 'charging') return false;
    const queued = queuedByKind(state).get(machine.kind);
    if (!queued) return false;
    // Solo tareas de su sección (preparadores y retráctiles están dedicados a una sección o sector).
    const sectionsSet = machine.sections ? new Set(machine.sections) : null;
    const candidates = queued.filter(
      (t) =>
        t.state === 'queued' &&
        t.machineKind === machine.kind &&
        !t.machineId &&
        (!t.section || !sectionsSet || sectionsSet.has(t.section)),
    );
    if (candidates.length === 0) return false;
    // Pedidos de tienda por orden de llegada (FIFO): primero el del camión que antes se atracó, para que los
    // camiones se completen uno tras otro en vez de avanzar todos a la vez; después, la tarea más cercana.
    const orderRank = new Map<string, number>();
    for (const t of state.trucks) {
      if (t.direction === 'outbound' && t.status === 'at_dock' && t.dockId) orderRank.set(t.dockId, Number(t.orderId?.replace(/\D+/g, '') ?? 0));
    }
    const rank = (t: (typeof candidates)[number]) => (t.dockId ? orderRank.get(t.dockId) ?? Infinity : Infinity);
    // La primera por (rango, distancia); en empate, la que va antes en la cola.
    let task = candidates[0];
    let bestR = rank(task);
    let bestD = (task.from.x - machine.pos.x) ** 2 + (task.from.z - machine.pos.z) ** 2;
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const r = rank(c);
      if (r > bestR) continue;
      const d = (c.from.x - machine.pos.x) ** 2 + (c.from.z - machine.pos.z) ** 2;
      if (r < bestR || d < bestD) {
        task = c;
        bestR = r;
        bestD = d;
      }
    }
    task.state = 'assigned';
    task.machineId = machine.id;
    machine.taskId = task.id;
    return true;
  },
};
