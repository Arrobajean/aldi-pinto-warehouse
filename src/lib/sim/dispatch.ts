import type { Machine, SimState, Truck } from '@/lib/sim/types';
import type { Dock, WarehouseLayout } from '@/lib/layout/types';

/** Política de despacho intercambiable (F12 añade la versión optimizada). */
export interface DispatchPolicy {
  /** Asigna muelle a un camión que espera aparcado. */
  assignDock(state: SimState, truck: Truck, layout: WarehouseLayout): Dock | null;
  /** Asigna una tarea encolada a una máquina libre de tipo compatible. */
  assignTask(state: SimState, machine: Machine): boolean;
}

function dockMatches(dock: Dock, truck: Truck): boolean {
  if (dock.temp !== truck.temp) return false;
  if (truck.direction === 'inbound') {
    // Frío entra por los muelles altos; lo demás por los de proveedores.
    if (dock.temp === 'dry') return dock.index < 14;
    return dock.index >= 44;
  }
  return dock.kind === 'outbound';
}

export const simpleDispatch: DispatchPolicy = {
  assignDock(state, truck, layout) {
    if (truck.status !== 'parking') return null;
    // Un muelle queda reservado desde que se asigna al camión (no solo al atracar).
    const busy = new Set([
      ...state.dockStates.filter((d) => d.truckId !== null).map((d) => d.dockId),
      ...state.trucks.filter((t) => t.dockId !== null && t.status !== 'leaving').map((t) => t.dockId as string),
    ]);
    const preferId = truck.orderId
      ? state.demand.orders.find((o) => o.id === truck.orderId)?.dockId
      : undefined;
    // Orden de preferencia: muelle del pedido y después el primer libre válido.
    const candidates = layout.docks.filter((dock) => {
      if (busy.has(dock.id)) return false;
      return dockMatches(dock, truck);
    });
    const first = candidates[0];
    if (!first) return null;
    const preferred = preferId ? candidates.find((c) => c.id === preferId) : undefined;
    return preferred ?? first;
  },

  assignTask(state, machine) {
    if (machine.status === 'charging') return false;
    const candidates = state.tasks.filter((t) => t.state === 'queued' && t.machineKind === machine.kind && !t.machineId);
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => {
      const da = (a.from.x - machine.pos.x) ** 2 + (a.from.z - machine.pos.z) ** 2;
      const db = (b.from.x - machine.pos.x) ** 2 + (b.from.z - machine.pos.z) ** 2;
      return da - db;
    });
    const task = candidates[0];
    task.state = 'assigned';
    task.machineId = machine.id;
    machine.taskId = task.id;
    return true;
  },
};