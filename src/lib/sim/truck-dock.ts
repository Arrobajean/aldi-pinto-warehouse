/** Muelle: descarga y carga con el frontal o la transpaleta, salida del camión y baja de sus palés. (extraído de trucks.ts) */

import { dockApproach } from '@/lib/layout/dock-geometry';
import type { Dock, Rect } from '@/lib/layout/types';
import type { SimDeps } from '@/lib/sim/deps';
import { emitEvent, nextTaskId } from '@/lib/sim/events';
import { dockInteriorPoint, stagingPoint } from '@/lib/sim/positions';
import { dockZoneOf, releaseZones } from '@/lib/sim/traffic-zones';
import { drive, fromHere, passBarrier } from '@/lib/sim/truck-motion';
import { stallByKey } from '@/lib/sim/truck-stalls';
import type { SimState, Truck } from '@/lib/sim/types';
import { TRUCK_CRUISE_V } from '@/lib/sim/vehicle';
import { EXIT_GATE_STOP, approachRoute, atBarrier, pulloutRoute, unparkEnd, unparkRoute } from '@/lib/sim/yard-routes';

/** Atraca el camión: empieza la descarga o la carga. */
export function dockTruck(state: SimState, t: Truck, dock: Dock) {
  t.status = 'at_dock';
  t.dockId = dock.id;
  t.stage = undefined;
  releaseZones(state, t, true);
  t.route = [];
  t.v = 0;
  t.speed = 0;
  const ds = state.dockStates.find((d) => d.dockId === dock.id);
  if (!ds) return;
  ds.truckId = t.id;
  ds.paletsProcessed = 0;
  ds.totalPalets = t.direction === 'inbound' ? t.cargoPaletIds.length : state.demand.orders.find((o) => o.id === t.orderId)?.paletsCount ?? 0;
  ds.state = t.direction === 'inbound' ? 'unloading' : 'loading';
  emitEvent(
    state,
    t.direction === 'inbound' ? 'truck_unloading' : 'truck_loading',
    `${t.plate} atracado en ${dock.id} — ${t.direction === 'inbound' ? 'descarga' : 'carga'}`,
  );
}

/** Asigna muelle y arranca la aproximación desde la báscula o desde una plaza de espera. */
export function startApproach(state: SimState, deps: SimDeps, t: Truck, dock: Dock) {
  t.dockId = dock.id;
  t.status = 'approaching';
  const stall = stallByKey(deps.layout, t.stallId);
  if (stall && t.stallId) {
    // Sale de la plaza en marcha atrás y vuelve por el bucle de reentrada (la plaza se libera al terminar de salir).
    state.lastStallExitAt = state.ts;
    t.stage = 'unpark';
    t.route = fromHere(t, unparkRoute(stall));
    t.nextRoute = approachRoute(unparkEnd(stall), dock);
  } else {
    t.stage = 'lane';
    t.route = fromHere(t, approachRoute('scale', dock));
  }
  emitEvent(state, 'truck_docked', `${t.plate} asignado al muelle ${dock.id}`);
}

/** Muelle en curso: en la descarga pide el siguiente palé al frontal; en la carga, el siguiente de la calle; al completarlo, el camión sale. */
export function stepAtDock(state: SimState, deps: SimDeps, t: Truck) {
  const dock = deps.layout.docks.find((d) => d.id === t.dockId)!;
  const dockId = t.dockId!;
  if (t.direction === 'inbound') {
    const nextPalet = t.cargoPaletIds[t.cargoPaletIds.length - 1];
    if (nextPalet) {
      // Una sola tarea de frontal por muelle en curso (no solo en cola): si no, se duplica el mismo palé.
      const pending = state.tasks.some((task) => task.state !== 'done' && task.kind === 'dock_shift' && task.dockId === dockId);
      if (!pending) {
        const p = state.paletById[nextPalet];
        if (p) {
          state.tasks.unshift({
            id: nextTaskId('TSK'),
            kind: 'dock_shift',
            machineKind: 'frontal',
            from: dockInteriorPoint(dock),
            to: stagingPoint(dock),
            dockId,
            paletIds: [nextPalet],
            duration: 6,
            state: 'queued',
          });
        }
      }
    } else if (!state.tasks.some((task) => task.dockId === dockId && task.state === 'queued')) {
      // Descarga completa → salir.
      finishTruck(state, deps, t);
    }
  } else {
    const ds = state.dockStates.find((d) => d.dockId === dockId);
    const lane = state.lanePallets[dockId] ?? [];
    const need = (ds?.totalPalets ?? 0) - t.paletsLoaded;
    if (need > 0 && lane.length > 0) {
      const pending = state.tasks.some((task) => task.dockId === dockId && task.state !== 'done' && task.kind === 'dock_shift');
      if (!pending) {
        const pid = lane[0]!;
        state.lanePallets[dockId] = lane.filter((x) => x !== pid);
        state.tasks.unshift({
          id: nextTaskId('TSK'),
          kind: 'dock_shift',
          machineKind: 'frontal',
          from: stagingPoint(dock),
          to: dockInteriorPoint(dock),
          dockId,
          paletIds: [pid],
          duration: 5,
          state: 'queued',
        });
      }
    } else if (targetFullyPrepared(state, t, ds?.totalPalets ?? 0) && t.paletsLoaded >= (ds?.totalPalets ?? 0)) {
      finishTruck(state, deps, t);
    }
  }
}

/** Salida: maniobra desde el muelle, barrera y alejamiento; al irse un camión de expedición se retiran sus palés. */
export function stepLeaving(state: SimState, deps: SimDeps, t: Truck, dt: number) {
  const from = t.fromDockId ? deps.layout.docks.find((d) => d.id === t.fromDockId) : undefined;
  let own: { id: string; rect: Rect } | undefined;
  if (from) {
    own = dockZoneOf(from);
    // La maniobra de salida termina al dejar atrás el arco (lejos del punto de atraque).
    const a = dockApproach(from);
    if (Math.hypot(t.pos.x - a.target.x, t.pos.z - a.target.z) > 32) {
      t.fromDockId = null;
      t.stage = 'lane';
      own = undefined;
    }
  }
  // Barrera de salida: espera ante ella antes de seguir (la zona del muelle ya se ha liberado si queda lejos).
  if (t.nextRoute.length > 0) {
    passBarrier(state, t, dt, own);
    return;
  }
  const arr = drive(state, t, TRUCK_CRUISE_V, false, dt, own);
  if (arr) {
    emitEvent(state, 'truck_left', `${t.plate} abandona la plataforma hacia ${t.direction === 'inbound' ? 'su origen' : 'sus tiendas'}`);
    if (t.direction === 'outbound') {
      state.stats.trucksOut++;
      state.stats.shipped += t.paletsLoaded;
      if (t.orderId) state.outboundDone.push(t.orderId);
      // Los palets expedidos salen de la nave: se retiran para no acumular memoria.
      retireShippedPalets(state, t.cargoPaletIds);
      t.cargoPaletIds = [];
    }
    t.status = 'done';
    releaseZones(state, t, true);
  }
}

function targetFullyPrepared(state: SimState, t: Truck, total: number): boolean {
  return (state.lanePallets[t.dockId ?? ''] ?? []).length + t.paletsLoaded >= total;
}

/** Libera el muelle y sale: avance recto, giro al carril de salida y fuera por la salida este (sin pasar por el parking). */
function finishTruck(state: SimState, deps: SimDeps, t: Truck) {
  const ds = state.dockStates.find((d) => d.dockId === t.dockId);
  if (ds) {
    ds.truckId = null;
    ds.state = 'free';
  }
  const dock = deps.layout.docks.find((d) => d.id === t.dockId);
  t.status = 'leaving';
  t.fromDockId = t.dockId;
  t.dockId = null;
  t.stage = 'pullout';
  const pull = dock ? atBarrier(pulloutRoute(dock), EXIT_GATE_STOP) : undefined;
  t.route = pull ? fromHere(t, pull.route) : [];
  t.nextRoute = pull?.nextRoute ?? [];
}

/** Elimina de la simulación los palets que acaban de salir en un camión. */
function retireShippedPalets(state: SimState, ids: string[]) {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  for (const pid of ids) delete state.paletById[pid];
  state.pallets = state.pallets.filter((p) => !gone.has(p.id));
  if (state.outboundDone.length > 500) state.outboundDone.splice(0, state.outboundDone.length - 500);
}
