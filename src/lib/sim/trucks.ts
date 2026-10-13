/**
 * Camiones: llegada, garita, báscula, plazas de espera, maniobra de atraque, carga/descarga y salida.
 * La pose (`pos`, `heading`, `v`) se integra aquí con la cinemática tipo bicicleta: la escena solo la dibuja.
 */
import type { Dock, WarehouseLayout, YardStall } from '@/lib/layout/types';
import { dockApproach } from '@/lib/layout/dock-geometry';
import { KEEP_OUT, dockInteriorPoint, stagingPoint } from '@/lib/sim/positions';
import { emitEvent, nextTaskId } from '@/lib/sim/events';
import { nextRandom } from '@/lib/sim/rng';
import type { Pallet, Point, SimState, Truck } from '@/lib/sim/types';
import type { SimDeps } from '@/lib/sim/tick';
import {
  TRUCK_APPROACH_V,
  TRUCK_BIKE,
  TRUCK_CRUISE_V,
  TRUCK_REVERSE_V,
  TRUCK_SLOW_DIST,
  followPath,
  shortestAngle,
  stepBike,
  type BikeState,
} from '@/lib/sim/vehicle';
import {
  SCALE_STOP,
  SPAWN_HEADING,
  TRUCK_SPAWN,
  approachRoute,
  gateRoute,
  pulloutRoute,
  stallPoint,
  stallRoute,
  unparkEnd,
  unparkRoute,
} from '@/lib/sim/yard-routes';

const PLATES = ['E-4821-KLP', 'E-9114-LCM', 'E-2650-PRQ', 'E-7308-JHV', 'E-1185-BNK', 'E-6620-XWZ', 'E-3456-TDQ', 'E-8899-MFA'];

/** Separación mínima entre dos camiones que entran por la garita (s). */
const GATE_GAP = 60;
/** Pesaje en la báscula (s): mínimo y margen aleatorio. */
const SCALE_DWELL_MIN = 20;
const SCALE_DWELL_SPAN = 15;
/** La báscula se libera cuando el camión que salía de ella está a esta distancia (m). */
const SCALE_CLEAR_DIST = 20;
/** Salidas de las plazas de espera hacia los muelles, escalonadas (s). */
const STALL_EXIT_GAP = 90;
/** Tolerancias de atraque: distancia al punto de atraque (m) y error de rumbo (rad). */
const DOCK_POS_TOL = 0.15;
const DOCK_HEADING_TOL = 0.05;
/** Fila de plazas de espera que se usa (la de z = 153 no tiene calle de acceso: queda de desbordamiento). */
const STALL_ROW_Z = 130;

/** Identificador de la plaza de espera i. */
export function stallKey(i: number): string {
  return `TP-${String(i + 1).padStart(2, '0')}`;
}

function stallByKey(layout: WarehouseLayout, key: string | null): YardStall | null {
  if (!key) return null;
  return layout.site.truckParking.stalls[Number(key.slice(3)) - 1] ?? null;
}

/** Plaza libre de la fila de espera más cercana a la entrada (la más al este). */
function freeStall(state: SimState, layout: WarehouseLayout): string | null {
  const stalls = layout.site.truckParking.stalls;
  for (let i = stalls.length - 1; i >= 0; i--) {
    if (stalls[i].z !== STALL_ROW_Z) continue;
    const key = stallKey(i);
    if (!state.stallOccupancy[key]) return key;
  }
  return null;
}

function newTruck(state: SimState, init: Pick<Truck, 'direction' | 'temp' | 'cargoPaletIds' | 'storeIds'> & Partial<Truck>): Truck {
  const id = `TRK-${String(++state.seq.truck).padStart(3, '0')}`;
  return {
    id,
    plate: PLATES[state.seq.truck % PLATES.length],
    status: 'offsite',
    dockId: null,
    pos: { ...TRUCK_SPAWN },
    path: [],
    route: [],
    speed: 0,
    heading: SPAWN_HEADING,
    v: 0,
    dwell: 0,
    stallId: null,
    nextRoute: [],
    fromDockId: null,
    progress: 0,
    gateAt: state.ts,
    paletsLoaded: 0,
    waitTimer: 0,
    ...init,
  };
}

function createPalet(state: SimState, temp: Pallet['temp'], destStoreId?: string): Pallet {
  const id = `PL-${String(++state.seq.palet).padStart(5, '0')}`;
  const p: Pallet = {
    id,
    sku: `SKU-${1037 + (state.seq.palet % 1780)}`,
    family: destStoreId ? 'pedido' : 'proveedor',
    temp,
    state: 'received',
    locId: null,
    pos: { ...KEEP_OUT },
    height: 1.2,
    destStoreId,
    receivedDay: 0,
    daysToExpiry: 30 + nextRandom(state) % 90,
    batch: `L${String(24000 + (state.seq.palet % 900)).padStart(5, '0')}`,
    quantity: 40 + (state.seq.palet % 60),
  };
  return p;
}

/** Crea un camión de proveedor con su carga. Llega fuera de la parcela y espera turno en la garita. */
function spawnInboundTruck(state: SimState, paletsCount: number, temp: 'dry' | 'cool' | 'frozen', provider: string): Truck {
  const cargoPaletIds: string[] = [];
  for (let i = 0; i < paletsCount; i++) {
    const p = createPalet(state, temp);
    p.family = provider;
    state.paletById[p.id] = p;
    state.pallets.push(p);
    cargoPaletIds.push(p.id);
  }
  const t = newTruck(state, { direction: 'inbound', temp, cargoPaletIds, storeIds: [] });
  state.trucks.push(t);
  return t;
}

export function updateInboundSpawns(state: SimState) {
  const list = state.demand.inbound;
  let spawned = 0;
  for (let i = state.spawnedInbound; i < list.length; i++) {
    const arrival = list[i];
    if (arrival.atTs > state.ts) break;
    if (state.trucks.length >= 36) break;
    state.spawnedInbound = i + 1;
    spawned++;
    spawnInboundTruck(state, arrival.paletsCount, arrival.temp, arrival.provider);
  }
  return spawned;
}

export function spawnOutboundIfRoom(state: SimState) {
  if (state.trucks.length >= 34) return;
  const order = state.demand.orders[state.outOrdersSpawned];
  if (!order) return;
  // Salidas escalonadas: un camión cada 5 min desde las 06:30, no todos a la vez al empezar el turno.
  const spawnAt = 6.5 * 3600 + state.outOrdersSpawned * 300;
  if (state.ts < spawnAt) return;
  state.outOrdersSpawned++;
  state.trucks.push(
    newTruck(state, { direction: 'outbound', temp: order.temp, cargoPaletIds: [], storeIds: [order.storeId], orderId: order.id }),
  );
}

/**
 * Patio sembrado al inicio del turno: cinco camiones de proveedor ya en plazas de espera y dos descargando
 * en muelles secos, para que la primera media hora tenga movimiento. Los de espera salen cada 90 s.
 */
export function seedYard(state: SimState, layout: WarehouseLayout) {
  const providers = ['Pastas Gallo', 'Central Lechera', 'Ultracongelados Polo', 'Bebidas del Sur', 'Conservas Mira'];
  const waitingTemps: Truck['temp'][] = ['dry', 'cool', 'dry', 'frozen', 'dry'];
  waitingTemps.forEach((temp, i) => {
    const t = spawnInboundTruck(state, 16 + Math.floor(nextRandom(state) * 20), temp, providers[i]);
    const key = freeStall(state, layout);
    const stall = stallByKey(layout, key);
    if (!key || !stall) return;
    state.stallOccupancy[key] = t.id;
    t.stallId = key;
    t.status = 'parking';
    t.pos = stallPoint(stall);
    t.heading = Math.PI;
    t.gateAt = state.ts;
    emitEvent(state, 'truck_arrived', `Camión ${t.plate} (proveedor ${providers[i]}) espera muelle en ${key}`);
  });
  state.lastStallExitAt = state.ts - STALL_EXIT_GAP + 30;

  const dryInbound = layout.docks.filter((d) => d.kind === 'inbound' && d.temp === 'dry');
  for (const dock of [dryInbound[2], dryInbound[7]]) {
    if (!dock) continue;
    const t = spawnInboundTruck(state, 16 + Math.floor(nextRandom(state) * 20), 'dry', 'Bebidas del Sur');
    const a = dockApproach(dock);
    t.pos = { ...a.target };
    t.heading = a.alignHeading;
    t.gateAt = state.ts;
    dockTruck(state, t, dock);
  }
}

/** Ruta que arranca en la posición actual del camión (el primer tramo va de donde está al primer punto). */
function fromHere(t: Truck, pts: Point[]): Point[] {
  return [{ x: t.pos.x, z: t.pos.z }, ...pts];
}

/** Pose del camión como vehículo tipo bicicleta (se escribe de vuelta tras cada paso). */
function bikeOf(t: Truck): BikeState {
  return { x: t.pos.x, z: t.pos.z, heading: t.heading, v: t.v };
}
function writeBack(t: Truck, b: BikeState) {
  t.pos.x = b.x;
  t.pos.z = b.z;
  t.heading = b.heading;
  t.v = b.v;
  t.speed = Math.abs(b.v);
}

/** Avanza el camión por su ruta. Devuelve true al llegar (parado en el último punto). */
function drive(t: Truck, vCap: number, reverse: boolean, dt: number): boolean {
  const b = bikeOf(t);
  const r = followPath(b, t.route, vCap, reverse, dt, TRUCK_BIKE);
  writeBack(t, b);
  if (r.done) {
    t.route = [];
    t.v = 0;
    t.speed = 0;
  }
  return r.done;
}

/** Libera la báscula cuando el camión que la ocupaba ya se ha alejado. */
function maybeClearScale(state: SimState, t: Truck) {
  if (state.scaleTruckId !== t.id) return;
  if (Math.hypot(t.pos.x - SCALE_STOP.x, t.pos.z - SCALE_STOP.z) > SCALE_CLEAR_DIST) state.scaleTruckId = null;
}

/** Atraca el camión: empieza la descarga o la carga. */
function dockTruck(state: SimState, t: Truck, dock: Dock) {
  t.status = 'at_dock';
  t.dockId = dock.id;
  t.stage = undefined;
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

/** Primer camión de la cola exterior (orden de llegada). */
function firstOffsite(state: SimState): Truck | undefined {
  return state.trucks.find((x) => x.status === 'offsite');
}

/** Asigna muelle y arranca la aproximación desde la báscula o desde una plaza de espera. */
function startApproach(state: SimState, deps: SimDeps, t: Truck, dock: Dock) {
  t.dockId = dock.id;
  t.status = 'approaching';
  const stall = stallByKey(deps.layout, t.stallId);
  if (stall && t.stallId) {
    // Sale de la plaza en marcha atrás y vuelve por el bucle de reentrada.
    delete state.stallOccupancy[t.stallId];
    t.stallId = null;
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

export function updateTruck(state: SimState, deps: SimDeps, t: Truck, dt: number) {
  switch (t.status) {
    case 'offsite': {
      // Cola exterior: entra uno a uno, con separación mínima en la garita y sin otro camión camino de la báscula.
      if (state.ts - state.lastGateAt < GATE_GAP) break;
      if (firstOffsite(state) !== t) break;
      if (state.trucks.some((x) => x.status === 'gate')) break;
      state.lastGateAt = state.ts;
      t.status = 'gate';
      t.gateAt = state.ts;
      t.pos = { ...TRUCK_SPAWN };
      t.heading = SPAWN_HEADING;
      t.v = TRUCK_CRUISE_V * 0.5;
      t.route = fromHere(t, gateRoute());
      t.stage = 'lane';
      emitEvent(
        state,
        'truck_arrived',
        t.direction === 'inbound'
          ? `Camión ${t.plate} (proveedor ${state.paletById[t.cargoPaletIds[0]]?.family ?? '—'}) entra por la garita`
          : `Camión ${t.plate} de salida entra por la garita`,
      );
      break;
    }
    case 'gate': {
      // Camino de la báscula; si está libre, sigue hasta ella; si no, espera detrás.
      if (state.scaleTruckId === null) {
        state.scaleTruckId = t.id;
        t.status = 'scale';
        t.route = t.route.length > 0 ? [...t.route, { ...SCALE_STOP }] : fromHere(t, [{ ...SCALE_STOP }]);
        t.dwell = SCALE_DWELL_MIN + nextRandom(state) * SCALE_DWELL_SPAN;
      }
      drive(t, TRUCK_CRUISE_V, false, dt);
      break;
    }
    case 'scale': {
      if (t.route.length > 0) {
        if (drive(t, TRUCK_CRUISE_V, false, dt)) emitEvent(state, 'truck_weighted', `${t.plate} pesa en la báscula`);
        break;
      }
      t.dwell -= dt;
      if (t.dwell > 0) break;
      const dock = deps.dispatch.assignDock(state, t, deps.layout);
      if (dock) {
        startApproach(state, deps, t, dock);
        break;
      }
      const key = freeStall(state, deps.layout);
      const stall = stallByKey(deps.layout, key);
      if (key && stall) {
        state.stallOccupancy[key] = t.id;
        t.stallId = key;
        t.status = 'parking';
        t.stage = 'lane';
        t.route = fromHere(t, stallRoute(stall));
      }
      break;
    }
    case 'parking': {
      maybeClearScale(state, t);
      if (t.route.length > 0) {
        drive(t, TRUCK_CRUISE_V, false, dt);
        break;
      }
      t.stage = undefined;
      if (state.ts - state.lastStallExitAt < STALL_EXIT_GAP) break;
      const dock = deps.dispatch.assignDock(state, t, deps.layout);
      if (dock) startApproach(state, deps, t, dock);
      break;
    }
    case 'approaching': {
      maybeClearScale(state, t);
      const dock = deps.layout.docks.find((d) => d.id === t.dockId);
      if (!dock) break;
      const a = dockApproach(dock);
      if (t.stage === 'unpark') {
        if (drive(t, TRUCK_REVERSE_V, true, dt)) {
          t.route = fromHere(t, t.nextRoute);
          t.nextRoute = [];
          t.stage = 'lane';
        }
        break;
      }
      if (t.stage === 'lane' || t.stage === 'arc') {
        const toStart = Math.hypot(t.pos.x - a.start.x, t.pos.z - a.start.z);
        if (t.stage === 'lane' && toStart < 1.5) t.stage = 'arc';
        const cap = toStart < TRUCK_SLOW_DIST || t.stage === 'arc' ? TRUCK_APPROACH_V : TRUCK_CRUISE_V;
        if (drive(t, cap, false, dt)) t.stage = 'reverse';
        break;
      }
      // Marcha atrás en línea recta hasta la niveladora; la corrección final alinea el rumbo.
      const b = bikeOf(t);
      stepBike(b, a.target.x, a.target.z, TRUCK_REVERSE_V, true, dt, TRUCK_BIKE, a.alignHeading);
      writeBack(t, b);
      const dist = Math.hypot(a.target.x - t.pos.x, a.target.z - t.pos.z);
      const herr = Math.abs(shortestAngle(a.alignHeading - t.heading));
      const stalled = Math.abs(t.v) < 0.02 && dist < 0.3;
      if ((dist < DOCK_POS_TOL && herr < DOCK_HEADING_TOL) || stalled) {
        t.pos = { ...a.target };
        t.heading = a.alignHeading;
        dockTruck(state, t, dock);
      }
      break;
    }
    case 'at_dock': {
      const dock = deps.layout.docks.find((d) => d.id === t.dockId)!;
      const dockId = t.dockId!;
      if (t.direction === 'inbound') {
        const nextPalet = t.cargoPaletIds[0];
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
      break;
    }
    case 'leaving': {
      if (t.fromDockId) {
        const from = deps.layout.docks.find((d) => d.id === t.fromDockId);
        // La maniobra de salida termina al dejar atrás el arco (lejos del punto de atraque).
        if (from) {
          const a = dockApproach(from);
          if (Math.hypot(t.pos.x - a.target.x, t.pos.z - a.target.z) > 32) {
            t.fromDockId = null;
            t.stage = 'lane';
          }
        }
      }
      const arr = drive(t, TRUCK_CRUISE_V, false, dt);
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
      }
      break;
    }
    case 'done':
      break;
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
  t.route = dock ? fromHere(t, pulloutRoute(dock)) : [];
}

/** Elimina de la simulación los palets que acaban de salir en un camión. */
function retireShippedPalets(state: SimState, ids: string[]) {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  for (const pid of ids) delete state.paletById[pid];
  state.pallets = state.pallets.filter((p) => !gone.has(p.id));
  if (state.outboundDone.length > 500) state.outboundDone.splice(0, state.outboundDone.length - 500);
}

