/** Fin de una tarea de máquina: aplica al almacén lo que deja (palés ubicados, repuestos, preparados, flejados o expedidos). (extraído de machine-tasks.ts) */

import { consolidationKey, consolidationLane, restackLane } from '@/lib/sim/consolidation';
import type { SimDeps } from '@/lib/sim/deps';
import { emitEvent } from '@/lib/sim/events';
import type { HandlingMachine } from '@/lib/sim/handling';
import { dockInteriorPoint, stagingPoint } from '@/lib/sim/positions';
import { strapperById } from '@/lib/sim/strappers';
import { PALLET_HEIGHT, type Machine, type SimState, type SimTask } from '@/lib/sim/types';

export function completeTask(state: SimState, deps: SimDeps, m: Machine, task: SimTask) {
  m.liftTarget = 0;
  task.state = 'done';
  const hm = m as HandlingMachine;
  hm.stops = undefined;
  hm.dropped = undefined;
  hm.handling = undefined;
  m.carriedPalets = [];
  m.hasPalet = false;

  if (task.kind === 'putaway' && task.toLocId) {
    const p = state.paletById[task.paletIds[0]];
    const slot = state.slotPos[task.toLocId];
    if (p && slot) {
      p.state = slot.level === 0 ? 'picking' : 'stored';
      p.locId = task.toLocId;
      p.pos = { x: slot.x, z: slot.z };
      p.height = PALLET_HEIGHT;
      state.rackOccupancy[task.toLocId] = p.id;
      state.rackDirty.push(task.toLocId);
      state.freeRack = state.freeRack.filter((l) => l !== task.toLocId);
      if (slot.level === 0) {
        if (slot.zoneId in state.freeL0ByZone) {
          const z = slot.zoneId as 'seco' | 'frio' | 'congelado';
          state.freeL0ByZone[z] = state.freeL0ByZone[z].filter((l: string) => l !== task.toLocId);
        }
        state.pickingByTemp[p.temp].push(p.id);
        const section = deps.sections.sectionOfLoc.get(task.toLocId);
        if (section) (state.pickingBySection[section] ??= []).push(p.id);
        emitEvent(state, 'pallet_stored', `${m.id} ubicó ${p.id} en ${task.toLocId} (picking suelo)`);
      } else {
        if (slot.zoneId === 'seco' || slot.zoneId === 'frio' || slot.zoneId === 'congelado') {
          state.storedByZone[slot.zoneId]++;
        }
        state.stats.stored++;
        emitEvent(state, 'pallet_stored', `${m.id} ubicó ${p.id} en ${task.toLocId}`);
      }
    }
  } else if (task.kind === 'replenish' && task.fromLocId && task.toLocId) {
    const p = state.paletById[task.paletIds[0]];
    if (p && state.rackOccupancy[task.fromLocId] === p.id) {
      delete state.rackOccupancy[task.fromLocId];
      state.rackOccupancy[task.toLocId] = p.id;
      state.rackDirty.push(task.fromLocId, task.toLocId);
      p.state = 'picking';
      p.locId = task.toLocId;
      const slot = state.slotPos[task.toLocId];
      p.pos = { x: slot.x, z: slot.z };
      state.freeRack.push(task.fromLocId);
      state.freeRack = state.freeRack.filter((l) => l !== task.toLocId);
      const fromSlot = state.slotPos[task.fromLocId];
      if (fromSlot.zoneId === 'seco' || fromSlot.zoneId === 'frio' || fromSlot.zoneId === 'congelado') {
        state.storedByZone[fromSlot.zoneId]--;
      }
      if (slot.zoneId in state.freeL0ByZone) {
        const z = slot.zoneId as 'seco' | 'frio' | 'congelado';
        state.freeL0ByZone[z] = state.freeL0ByZone[z].filter((l: string) => l !== task.toLocId);
      }
      state.pickingByTemp[p.temp].push(p.id);
      const section = deps.sections.sectionOfLoc.get(task.toLocId);
      if (section) (state.pickingBySection[section] ??= []).push(p.id);
      emitEvent(state, 'pallet_picked', `${m.id} repuso ${p.id} en ${task.toLocId} (picking)`);
    }
  } else if (task.kind === 'pick') {
    const station = task.strapperId ? strapperById(deps, task.strapperId) : undefined;
    const lanePoint = station ? (task.manual ? station.output : station.input) : task.to;
    for (const pid of task.paletIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      if (p.locId && state.rackOccupancy[p.locId] === p.id) {
        delete state.rackOccupancy[p.locId];
        state.rackDirty.push(p.locId);
        state.freeRack.push(p.locId);
        const slot = state.slotPos[p.locId];
        if (slot.zoneId === 'seco' || slot.zoneId === 'frio' || slot.zoneId === 'congelado') {
          if (slot.level === 0) state.freeL0ByZone[slot.zoneId].push(p.locId);
        }
      }
      state.pickingByTemp[p.temp] = state.pickingByTemp[p.temp].filter((x) => x !== pid);
      if (task.section) state.pickingBySection[task.section] = (state.pickingBySection[task.section] ?? []).filter((x) => x !== pid);
      p.state = 'prepared';
      p.pos = { ...lanePoint };
      p.dockId = task.dockId;
    }
    // Entrada en la flejadora (cola) o, si se ha flejado a mano, directamente en su salida.
    if (task.dockId && task.strapperId) {
      const ids = task.paletIds.filter((pid) => state.paletById[pid]);
      if (task.manual) {
        state.strapOut.push({ dockId: task.dockId, paletIds: ids, strapperId: task.strapperId });
      } else {
        const st = state.strappers.find((x) => x.id === task.strapperId);
        if (st) st.queue.push({ dockId: task.dockId, paletIds: ids });
      }
    }
    state.stats.picked += task.paletIds.length;
    state.stats.prepared += task.paletIds.length;
    emitEvent(state, 'pallet_prepared', `${m.id} preparó ${task.paletIds.length} palets en la calle de ${task.dockId}`);
  } else if (task.kind === 'transfer' && task.dockId && task.consolidate) {
    // El lote queda en la calle de la playa de consolidación reservada para el pedido del muelle.
    const slot = state.consolidation[consolidationKey(task.dockId, task.consolidate)];
    const lane = consolidationLane(deps, slot?.laneId);
    for (const pid of task.paletIds) {
      const p = state.paletById[pid];
      if (!p || !slot) continue;
      slot.paletIds.push(pid);
      p.dockId = task.dockId;
      if (!lane) p.pos = { ...task.to };
    }
    // Cada palé rueda hasta su hueco de la fila: se recoloca la calle entera según su orden.
    if (slot && lane) restackLane(state, slot, lane);
    emitEvent(state, 'pallet_prepared', `${m.id} dejó ${task.paletIds.length} palets en la consolidación ${task.consolidate} (${task.dockId})`);
  } else if (task.kind === 'transfer' && (task.dockId || task.paletIds.length > 0)) {
    // La transpaleta ESE deja los pedidos en las calles de los muelles (desde la flejadora o desde una playa).
    for (const pid of task.paletIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      const targetDockId = p.dockId ?? task.dockId;
      if (!targetDockId) continue;
      for (const slot of Object.values(state.consolidation)) {
        if (slot.dockId !== targetDockId || !slot.paletIds.includes(pid)) continue;
        slot.paletIds = slot.paletIds.filter((id) => id !== pid);
        // Al salir el palé de delante, la fila avanza hacia el fondo.
        const lane = consolidationLane(deps, slot.laneId);
        if (lane) restackLane(state, slot, lane);
      }
      const targetDock = deps.dockById.get(targetDockId);
      if (targetDock) {
        const lane = stagingPoint(targetDock);
        p.pos = { ...lane };
        p.dockId = targetDockId;
        state.lanePallets[targetDockId] = [...(state.lanePallets[targetDockId] ?? []).filter((id) => id !== pid), pid];
      }
    }
    emitEvent(state, 'pallet_prepared', `${m.id} llevó ${task.paletIds.length} palets preparados a los muelles`);
  } else if (task.kind === 'dock_shift') {
    const taskDock = task.dockId ? deps.layout.docks.find((d) => d.id === task.dockId) : undefined;
    const truck = state.trucks.find((t) => t.dockId === task.dockId);
    for (const pid of task.paletIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      if (p.state === 'received' && truck && truck.direction === 'inbound' && taskDock) {
        p.state = 'staging';
        p.dockId = taskDock.id;
        p.pos = stagingPoint(taskDock);
        state.stagingQueue.push(pid);
        truck.cargoPaletIds = truck.cargoPaletIds.filter((x) => x !== pid);
        state.stats.received++;
        const ds = state.dockStates.find((d) => d.dockId === taskDock.id);
        if (ds) ds.paletsProcessed++;
        emitEvent(state, 'pallet_received', `Frontal descargó ${p.id} de ${taskDock.id} a Recepción`);
      } else if (p.state === 'prepared' && truck && truck.direction === 'outbound' && taskDock) {
        p.state = 'loaded';
        p.dockId = taskDock.id;
        p.pos = dockInteriorPoint(taskDock);
        p.truckId = truck.id;
        truck.cargoPaletIds.push(pid);
        truck.paletsLoaded++;
        const ds = state.dockStates.find((d) => d.dockId === taskDock.id);
        if (ds) ds.paletsProcessed++;
      }
    }
  }

  m.taskId = null;
  m.status = 'idle';
  m.hasPalet = false;
  m.carriedPalets = [];
  m.route = [];
}
