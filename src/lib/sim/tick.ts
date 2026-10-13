import type { WarehouseLayout } from '@/lib/layout/types';
import { LEVEL_HEIGHT, rackRects } from '@/lib/layout/pinto-layout';
import { articleForSku } from '@/lib/stock/catalog';
import { dockInteriorPoint, reserveZone, stagingPoint } from '@/lib/sim/positions';
import { PathFinder } from '@/lib/sim/path';
import { emitEvent, nextTaskId } from '@/lib/sim/events';
import { nextRandom } from '@/lib/sim/init';
import { shiftAt, type SimState } from '@/lib/sim/types';
import type { Machine, Pallet, Point, SimTask, Truck } from '@/lib/sim/types';
import { spawnOutboundIfRoom, updateInboundSpawns, updateTruck } from '@/lib/sim/trucks';
import type { RoomSpot } from '@/lib/layout/types';
import { simpleDispatch, type DispatchPolicy } from '@/lib/sim/dispatch';

export interface SimDeps {
  layout: WarehouseLayout;
  indoor: PathFinder;
  yard: PathFinder;
  dispatch: DispatchPolicy;
  /** Asientos por pasillo con su rango z unido (índice estático). */
  aisles: { id: string; xCenter: number; zMin: number; zMax: number }[];
}

const SPEED: Record<Machine['kind'], { empty: number; load: number }> = {
  retractil: { empty: 2.3, load: 0.9 },
  frontal: { empty: 2.0, load: 1.0 },
  recogepedidos: { empty: 1.8, load: 1.4 },
  transpaleta: { empty: 1.6, load: 1.2 },
};

/** Capacidad de cola de cada flejadora (palés) antes de considerarla llena. */
const STRAP_QUEUE_LIMIT = 8;
/** Segundos por palé que tarda el preparador en flejar a mano (tren lleno). */
const MANUAL_STRAP_SECONDS = 45;

function strapperById(deps: SimDeps, id: string) {
  return deps.layout.strappers.find((s) => s.id === id);
}

/** Flejadora con cola libre más cercana a un punto; null si todas están llenas. */
function freeStrapper(state: SimState, deps: SimDeps, at: { x: number; z: number }) {
  let best: { id: string; d: number } | null = null;
  for (const st of state.strappers) {
    const load = st.queue.reduce((k, e) => k + e.paletIds.length, 0) + (st.current?.paletIds.length ?? 0);
    if (load >= STRAP_QUEUE_LIMIT) continue;
    const station = strapperById(deps, st.id);
    if (!station) continue;
    const d = (station.input.x - at.x) ** 2 + (station.input.z - at.z) ** 2;
    if (!best || d < best.d) best = { id: st.id, d };
  }
  return best?.id ?? null;
}

/** Flejadora más cercana (para el caso manual). */
function nearestStrapper(deps: SimDeps, at: { x: number; z: number }): string {
  let best = deps.layout.strappers[0];
  let bestD = Infinity;
  for (const s of deps.layout.strappers) {
    const d = (s.output.x - at.x) ** 2 + (s.output.z - at.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best.id;
}

/** Avanza una flejadora: procesa un lote a la vez y lo deja en su salida. */
function advanceStrapper(state: SimState, deps: SimDeps, st: SimState['strappers'][number]) {
  const station = strapperById(deps, st.id);
  if (!station) return;
  if (st.current && state.ts >= st.current.doneAt) {
    state.strapOut.push({ dockId: st.current.dockId, paletIds: st.current.paletIds, strapperId: st.id });
    st.current = null;
  }
  if (!st.current && st.queue.length > 0) {
    const entry = st.queue.shift()!;
    const seconds = station.secondsPerPallet * entry.paletIds.length;
    st.current = { dockId: entry.dockId, paletIds: entry.paletIds, doneAt: state.ts + seconds };
  }
}

function aisleAt(deps: SimDeps, x: number, z: number): string | null {
  for (const a of deps.aisles) {
    if (Math.abs(a.xCenter - x) > 1.7) continue;
    if (z >= a.zMin && z <= a.zMax) return a.id;
  }
  return null;
}

function speedFor(m: Machine) {
  return m.hasPalet ? SPEED[m.kind].load : SPEED[m.kind].empty;
}

function moveAlong(state: SimState, deps: SimDeps, m: Machine, dt: number): boolean {
  if (m.route.length === 0) return true;

  const target = m.route[0];
  const aisleId = aisleAt(deps, target.x, target.z);
  const holders = aisleId ? state.aisleLocks[aisleId] ?? [] : [];
  if (aisleId && !holders.includes(m.id) && holders.length >= AISLE_CAPACITY) {
    // Pasillo completo: esperar en la cabecera.
    m.status = 'waiting';
    if (!m.waitingOnce) {
      m.waitingOnce = true;
      emitEvent(state, 'machine_waiting', `${m.id} espera al pasillo ${aisleId} ocupado`);
    }
    return false;
  }
  m.waitingOnce = false;

  m.status = 'traveling';
  let step = speedFor(m) * dt;
  // Pequeño tope de velocidad al entrar/salir de pasillos.
  if (aisleId) step = Math.min(step, 0.6 * 0.1);
  const dx = target.x - m.pos.x;
  const dz = target.z - m.pos.z;
  const dist = Math.hypot(dx, dz);
  // Las máquinas miran a +Z con rotación 0: el rumbo sale de la dirección de avance.
  if (dist > 1e-6) m.heading = Math.atan2(dx, dz);
  if (dist <= step) {
    m.pos.x = target.x;
    m.pos.z = target.z;
    m.route.shift();
  } else {
    const f = step / dist;
    m.pos.x += dx * f;
    m.pos.z += dz * f;
  }
  // Los palets transportados viajan con la máquina en cada paso.
  if (m.hasPalet) {
    for (const pid of m.carriedPalets) {
      const p = state.paletById[pid];
      if (p) {
        p.pos.x = m.pos.x;
        p.pos.z = m.pos.z;
      }
    }
  }
  m.speed = step / dt;

  // Reservar el pasillo del siguiente objetivo.
  if (m.aisleReserved && (!aisleId || m.aisleReserved !== aisleId)) releaseAisle(state, m);
  if (aisleId && !m.aisleReserved) {
    state.aisleLocks[aisleId] = [...(state.aisleLocks[aisleId] ?? []), m.id];
    m.aisleReserved = aisleId;
  }
  return false;
}

function beginTask(state: SimState, deps: SimDeps, m: Machine, task: SimTask) {
  task.state = 'transit';
  m.liftTarget = 0;
  m.carriedPalets = [...task.paletIds];
  m.hasPalet = task.paletIds.length > 0 && task.kind !== 'pick';
  m.status = 'traveling';
  m.route = deps.indoor.pointsFor(deps.indoor.find(m.pos, deps.indoor.nearestTo(task.to)));
  // Transferencia y frontal de muelle: primero recogen en 'from' (salida de flejadora / calle) y luego llevan a 'to'.
  if (task.kind === 'transfer' || task.kind === 'dock_shift') {
    const fromNode = deps.indoor.nearestTo(task.from);
    m.route = [
      ...deps.indoor.pointsFor(deps.indoor.find(m.pos, fromNode)),
      ...deps.indoor.pointsFor(deps.indoor.find(task.from, deps.indoor.nearestTo(task.to))),
    ];
  }
  // En pick, la ruta pasa por cada ubicación del lote.
  if (task.kind === 'pick') {
    // Cada parada es el nodo del pasillo frente al hueco, nunca el hueco dentro de la estantería.
    // Entre paradas se sigue el grafo de pasillos, no una recta (que cortaría racks).
    const stopIds = task.paletIds
      .map((pid) => state.paletById[pid])
      .filter((p): p is Pallet => Boolean(p))
      .map((p) => deps.indoor.nearestTo(p.pos));
    const route: Point[] = [];
    let cur: Point = m.pos;
    for (const id of stopIds) {
      route.push(...deps.indoor.pointsFor(deps.indoor.find(cur, id)));
      cur = deps.indoor.nodePoint(id) ?? cur;
    }
    route.push(...deps.indoor.pointsFor(deps.indoor.find(cur, deps.indoor.nearestTo(task.to))));
    m.route = route;
    m.hasPalet = true;
  }
}

function completeTask(state: SimState, deps: SimDeps, m: Machine, task: SimTask) {
  m.liftTarget = 0;
  task.state = 'done';

  if (task.kind === 'putaway' && task.toLocId) {
    const p = state.paletById[task.paletIds[0]];
    const slot = state.slotPos[task.toLocId];
    if (p && slot) {
      p.state = 'stored';
      p.locId = task.toLocId;
      p.pos = { x: slot.x, z: slot.z };
      p.height = 1.0 + nextRandom(state) * 0.5;
      state.rackOccupancy[task.toLocId] = p.id;
      state.rackDirty.push(task.toLocId);
      state.freeRack = state.freeRack.filter((l) => l !== task.toLocId);
      if (slot.zoneId === 'seco' || slot.zoneId === 'frio' || slot.zoneId === 'congelado') {
        state.storedByZone[slot.zoneId]++;
      }
      state.stats.stored++;
      emitEvent(state, 'pallet_stored', `${m.id} ubicó ${p.id} en ${task.toLocId}`);
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
      state.pickingByTemp[p.temp].push(p.id);
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
  } else if (task.kind === 'transfer' && task.dockId) {
    // La transpaleta ESE deja los pedidos en la calle del muelle.
    const taskDock = deps.layout.docks.find((d) => d.id === task.dockId);
    if (!taskDock) return;
    const lane = stagingPoint(taskDock);
    for (const pid of task.paletIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      p.pos = { ...lane };
      p.dockId = task.dockId;
      state.lanePallets[task.dockId] = [...(state.lanePallets[task.dockId] ?? []), pid];
    }
    emitEvent(state, 'pallet_prepared', `${m.id} llevó ${task.paletIds.length} palets preparados a la calle de ${task.dockId}`);
  } else if (task.kind === 'dock_shift') {
    const taskDock = task.dockId ? deps.layout.docks.find((d) => d.id === task.dockId) : undefined;
    const truck = state.trucks.find((t) => t.dockId === task.dockId);
    for (const pid of task.paletIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      if (p.state === 'received' && truck && truck.direction === 'inbound' && taskDock) {
        p.state = 'staging';
        p.pos = stagingPoint(taskDock);
        state.stagingQueue.push(pid);
        truck.cargoPaletIds = truck.cargoPaletIds.filter((x) => x !== pid);
        state.stats.received++;
        emitEvent(state, 'pallet_received', `Frontal descargó ${p.id} de ${taskDock.id} a Expedición`);
      } else if (p.state === 'prepared' && truck && truck.direction === 'outbound' && taskDock) {
        p.state = 'loaded';
        p.pos = dockInteriorPoint(taskDock);
        p.truckId = truck.id;
        truck.cargoPaletIds.push(pid);
        truck.paletsLoaded++;
      }
    }
  }

  m.taskId = null;
  m.status = 'idle';
  m.hasPalet = false;
  m.carriedPalets = [];
  m.route = [];
}

/** Velocidad de subida/bajada de la horquilla, en m/s. */
const LIFT_SPEED = 0.6;

/** Altura del hueco (0 si es suelo o no existe). */
function slotHeight(state: SimState, locId: string | null | undefined): number {
  if (!locId) return 0;
  const slot = state.slotPos[locId];
  return slot ? slot.level * LEVEL_HEIGHT : 0;
}

/** Hueco que determina la altura de trabajo de una tarea. */
function liftLocFor(state: SimState, task: SimTask): string | null | undefined {
  if (task.kind === 'putaway') return task.toLocId;
  if (task.kind === 'replenish') return task.fromLocId;
  return state.paletById[task.paletIds[0]]?.locId;
}

/** Máquinas que pueden circular a la vez por un pasillo de 4 m. */
const AISLE_CAPACITY = 2;
/** Batería por debajo de la cual la máquina va a cargar. */
const CHARGE_THRESHOLD = 22;
/** Batería a partir de la cual la carga termina. */
const CHARGED_LEVEL = 99.5;

/** Libera el pasillo reservado. Sin esto, una máquina parada en un pasillo bloquea a las demás. */
function releaseAisle(state: SimState, m: Machine) {
  if (!m.aisleReserved) return;
  const rest = (state.aisleLocks[m.aisleReserved] ?? []).filter((id) => id !== m.id);
  if (rest.length > 0) state.aisleLocks[m.aisleReserved] = rest;
  else delete state.aisleLocks[m.aisleReserved];
  m.aisleReserved = null;
}

/** Libera la plaza de sala de la máquina (al salir a trabajar o al terminar de cargar). */
function releaseSpot(state: SimState, m: Machine) {
  if (m.spot && state.spotOccupancy[m.spot] === m.id) delete state.spotOccupancy[m.spot];
  m.spot = null;
  m.mission = null;
}

function spotById(deps: SimDeps, id: string | null): RoomSpot | null {
  if (!id) return null;
  for (const room of deps.layout.rooms) for (const spot of room.spots) if (spot.id === id) return spot;
  return null;
}

/** Plaza libre más cercana de un tipo. */
function findFreeSpot(state: SimState, deps: SimDeps, kind: 'reposo' | 'carga', m: Machine): RoomSpot | null {
  let best: RoomSpot | null = null;
  let bestD = Infinity;
  for (const room of deps.layout.rooms) {
    for (const spot of room.spots) {
      if (spot.kind !== kind || state.spotOccupancy[spot.id]) continue;
      const d = (spot.x - m.pos.x) ** 2 + (spot.z - m.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = spot;
      }
    }
  }
  return best;
}

/** Llegada a la plaza: cargar o quedar aparcada. */
function arriveAtSpot(m: Machine) {
  if (m.mission === 'charge') {
    m.status = 'charging';
  } else {
    m.status = 'idle';
    m.mission = null;
  }
}

/**
 * Comportamiento sin tarea: ir a una plaza de reposo o de carga, cargar y quedarse aparcada.
 * Una máquina con batería baja pasa de la plaza de reposo a una de carga.
 */
function updateIdle(state: SimState, deps: SimDeps, m: Machine, dt: number) {
  if (m.route.length > 0) {
    moveAlong(state, deps, m, dt);
    if (m.route.length === 0) arriveAtSpot(m);
    return;
  }
  if (m.spot) {
    const spot = spotById(deps, m.spot);
    if (m.battery < CHARGE_THRESHOLD && spot?.kind === 'reposo') releaseSpot(state, m);
    else return;
  }
  const kind: 'reposo' | 'carga' = m.battery < CHARGE_THRESHOLD ? 'carga' : 'reposo';
  const spot = findFreeSpot(state, deps, kind, m);
  if (!spot) return;
  state.spotOccupancy[spot.id] = m.id;
  m.spot = spot.id;
  m.mission = kind === 'carga' ? 'charge' : 'park';
  m.route = deps.indoor.pointsFor(deps.indoor.find(m.pos, `spot-${spot.id}`));
  m.status = 'traveling';
  if (m.route.length === 0) arriveAtSpot(m);
}

/** Contadores de un paso de simulación compartidos por todas las máquinas. */
interface MachineTickCtx {
  /** Máquinas de almacén con tarea (los ERE de muelle son una cuadrilla aparte y no cuentan). */
  active: number;
}

/** Separación mínima entre dos máquinas que dejan su plaza de la sala (s). */
const SPOT_RELEASE_GAP = 3;

/**
 * Una máquina acepta tareas si es turno de día, ya ha fichado (retraso escalonado desde el inicio del turno),
 * no se supera el número de máquinas de almacén activas del turno (`SHIFTS[].machines`; los ERE de muelle
 * no cuentan: un camión atracado no puede esperar) y, si está aparcada, le toca salir de la sala.
 */
function canTakeTask(state: SimState, m: Machine, ctx: MachineTickCtx): boolean {
  const shift = shiftAt(state.ts);
  if (shift.id === 'noche') return false;
  if (state.ts < state.lastShiftChange + m.clockInDelay) return false;
  if (m.kind !== 'frontal' && ctx.active >= shift.machines) return false;
  const parked = m.spot !== null && m.route.length === 0;
  if (parked && state.ts - state.lastSpotReleaseAt < SPOT_RELEASE_GAP) return false;
  return true;
}

function updateMachine(state: SimState, deps: SimDeps, m: Machine, dt: number, ctx: MachineTickCtx) {
  // Solo se mantiene la reserva mientras la máquina se desplaza.
  if (m.status !== 'traveling' && m.status !== 'waiting') releaseAisle(state, m);

  // La horquilla sube o baja hacia su altura objetivo con velocidad limitada.
  const liftDiff = m.liftTarget - m.liftHeight;
  m.liftHeight += Math.sign(liftDiff) * Math.min(Math.abs(liftDiff), LIFT_SPEED * dt);

  // Batería y recarga: la máquina permanece en su plaza de carga.
  if (m.status === 'charging') {
    m.battery = Math.min(100, m.battery + dt * 0.8);
    m.route = [];
    if (m.battery >= CHARGED_LEVEL) {
      m.status = 'idle';
      releaseSpot(state, m);
    }
    return;
  }
  m.battery = Math.max(0, m.battery - dt * 0.0028);
  m.hoursUsed += dt / 3600;

  if (!m.taskId) {
    if (m.battery < 20 && !m.batteryEventSent) {
      m.batteryEventSent = true;
      emitEvent(state, 'machine_low_battery', `${m.id} (${m.operatorName}) con ${Math.round(m.battery)}% — va a recargar`);
    }
    // Fuera de turno (noche) no se asignan tareas: la máquina termina y aparca en la sala de máquinas.
    const assigned = canTakeTask(state, m, ctx) && deps.dispatch.assignTask(state, m);
    if (assigned) {
      if (m.kind !== 'frontal') ctx.active++;
      // Las máquinas aparcadas salen de la sala de una en una.
      if (m.spot && m.route.length === 0) state.lastSpotReleaseAt = state.ts;
      // Sale de la plaza de sala (o abandona el trayecto hacia ella) para trabajar.
      releaseSpot(state, m);
      m.route = [];
      const task = state.tasks.find((t) => t.id === m.taskId);
      if (task) beginTask(state, deps, m, task);
      return;
    }
    updateIdle(state, deps, m, dt);
    return;
  }

  const task = state.tasks.find((t) => t.id === m.taskId);
  if (!task) {
    m.taskId = null;
    return;
  }

  if (task.state === 'transit') {
    const arrived = moveAlong(state, deps, m, dt);
    if (arrived) {
      m.status = 'working';
      m.liftTarget = slotHeight(state, liftLocFor(state, task));
      task.state = 'working';
      m.workingRemaining = task.duration;
    }
    return;
  }

  if (task.state === 'working') {
    m.workingRemaining -= dt;
    if (m.workingRemaining <= 0) {
      completeTask(state, deps, m, task);
      if (m.kind !== 'frontal') ctx.active--;
    }
  }
}

const TEMPS: Pallet['temp'][] = ['dry', 'cool', 'frozen'];
/** Reparto supuesto de un pedido multitemperatura entre secciones (ajustar con datos de ventas). */
const ORDER_TEMP_SHARE: Record<Pallet['temp'], number> = { dry: 0.7, cool: 0.2, frozen: 0.1 };

/** Palés por temperatura que ya están en el circuito de un muelle (lane, flejado, transferencia y recogidas). */
function dockTempCounts(state: SimState, dockId: string): Record<Pallet['temp'], number> {
  const c: Record<Pallet['temp'], number> = { dry: 0, cool: 0, frozen: 0 };
  const add = (ids: string[]) => {
    for (const pid of ids) {
      const p = state.paletById[pid];
      if (p) c[p.temp]++;
    }
  };
  add(state.lanePallets[dockId] ?? []);
  for (const st of state.strappers) {
    for (const e of st.queue) if (e.dockId === dockId) add(e.paletIds);
    if (st.current?.dockId === dockId) add(st.current.paletIds);
  }
  for (const e of state.strapOut) if (e.dockId === dockId) add(e.paletIds);
  for (const t of state.tasks) {
    if ((t.kind === 'pick' || t.kind === 'transfer') && t.dockId === dockId && t.state !== 'done') add(t.paletIds);
  }
  return c;
}

/** Genera pedidos (pick), reposiciones y putaway usando los índices incrementales. */
function generateWork(state: SimState, deps: SimDeps) {
  // Putaway: palets en Expedición (staging) → hueco de reserva.
  const staging = [...state.stagingQueue];
  let putawayBudget = 2;
  for (const pid of staging) {
    if (putawayBudget <= 0) break;
    const p = state.paletById[pid];
    if (!p || p.state !== 'staging') continue;
    if (state.tasks.some((t) => t.state === 'queued' && t.kind === 'putaway' && t.paletIds[0] === pid)) continue;
    const zone = reserveZone(p.temp);
    const candidates = state.freeRack.filter((loc) => {
      const slot = state.slotPos[loc];
      return slot && slot.zoneId === zone && slot.level >= 1;
    });
    if (candidates.length === 0) continue;
    // Los artículos A se ubican cerca de Expedición (z mayor).
    const article = p.sku ? articleForSku(p.sku).rotation === 'A' : false;
    const pickOne = [...candidates].sort(
      (a, b) => (article ? state.slotPos[b].z - state.slotPos[a].z : state.slotPos[a].z - state.slotPos[b].z),
    )[0]!;
    const destLoc = pickOne;
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
      duration: 6 + nextRandom(state) * 4,
      state: 'queued',
    });
    putawayBudget--;
  }

  // Picking para cada camión de salida atracado.
  // El pedido se prepara en el muelle donde está atracado el camión (puede diferir del muelle previsto).
  const loadingTrucks = new Map<string, Truck>();
  for (const t of state.trucks) {
    if (t.direction === 'outbound' && t.status === 'at_dock' && t.orderId && t.dockId) loadingTrucks.set(t.orderId, t);
  }
  for (const order of state.demand.orders) {
    const truck = loadingTrucks.get(order.id);
    if (!truck || !truck.dockId) continue;
    const dockId = truck.dockId;
    // Recogidas abiertas para este muelle (en cola o en curso): una a la vez.
    const openPicks = state.tasks.filter((task) => task.kind === 'pick' && task.dockId === dockId && task.state !== 'done');
    if (openPicks.length > 0) continue;
    // Cada pedido es multitemperatura: se reparte entre seco, frío y congelado.
    // Se pide a cada sección lo que le falta según su parte del pedido.
    const pipeline = dockTempCounts(state, dockId);
    // Lo ya cargado en el camión también cuenta como servido: no se pide de nuevo.
    for (const pid of truck.cargoPaletIds) {
      const p = state.paletById[pid];
      if (p) pipeline[p.temp]++;
    }
    const shares = ORDER_TEMP_SHARE;
    let temp: Pallet['temp'] | null = null;
    let deficit = 0;
    for (const t of TEMPS) {
      const missing = order.paletsCount * shares[t] - pipeline[t];
      if (missing > deficit && state.pickingByTemp[t].length > 0) {
        deficit = missing;
        temp = t;
      }
    }
    if (!temp) continue;
    // Palés ya reservados por otra recogida abierta no se vuelven a elegir.
    const reserved = new Set(state.tasks.filter((t) => t.kind === 'pick' && t.state !== 'done').flatMap((t) => t.paletIds));
    const candidates = state.pickingByTemp[temp].filter((pid) => !reserved.has(pid));
    if (candidates.length === 0) continue;
    // Muestreo aleatorio (con semilla): las recogidas se reparten por todo el suelo de la sección.
    const take: string[] = [];
    // Redondeo (no techo): con ceil cada sección sobrepedía y los palés sobrantes se quedaban en la calle.
    for (let k = 0; k < Math.min(Math.round(deficit), 8) && candidates.length > 0; k++) {
      const i = Math.floor(nextRandom(state) * candidates.length);
      take.push(candidates.splice(i, 1)[0]);
    }
    if (take.length === 0) continue;
    const firstSlot = state.slotPos[state.paletById[take[0]]?.locId ?? ''];
    const from = firstSlot ? { x: firstSlot.x, z: firstSlot.z } : { x: 0, z: 47 };
    // Entrada de la flejadora con cola libre; si las dos están llenas, el preparador flejará a mano.
    const freeId = freeStrapper(state, deps, from);
    const manual = freeId === null;
    const strapperId = freeId ?? nearestStrapper(deps, from);
    const station = strapperById(deps, strapperId);
    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'pick',
      machineKind: 'recogepedidos',
      from,
      to: station ? (manual ? station.output : station.input) : from,
      dockId,
      paletIds: take,
      duration: manual ? 4 + MANUAL_STRAP_SECONDS * take.length : 4,
      strapperId,
      manual,
      state: 'queued',
    });
  }

  // Transferencia: los lotes ya flejados salen de la flejadora y la ESE los lleva a la calle del muelle.
  for (const st of state.strappers) advanceStrapper(state, deps, st);
  for (const entry of [...state.strapOut]) {
    if (state.tasks.some((t) => t.kind === 'transfer' && t.dockId === entry.dockId)) continue;
    const dk = deps.layout.docks.find((d) => d.id === entry.dockId);
    if (!dk) continue;
    state.strapOut = state.strapOut.filter((e) => e !== entry);
    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'transfer',
      machineKind: 'transpaleta',
      from: { ...(strapperById(deps, entry.strapperId)?.output ?? { x: 0, z: 47 }) },
      to: stagingPoint(dk),
      dockId: entry.dockId,
      paletIds: [...entry.paletIds],
      duration: 3 + entry.paletIds.length * 0.8,
      state: 'queued',
    });
  }

  // Reposición: nivel 0 escaso → reserva baja a picking.
  for (const zone of ['seco', 'frio', 'congelado'] as const) {
    if (state.pickingByTemp[zone === 'seco' ? 'dry' : zone === 'frio' ? 'cool' : 'frozen'].length > 12) continue;
    if (state.tasks.some((t) => t.state === 'queued' && t.kind === 'replenish')) continue;
    if (state.storedByZone[zone] === 0) continue;
    const freeL0 = state.freeL0ByZone[zone][0];
    if (!freeL0) continue;
    const toSlot = state.slotPos[freeL0];
    // Producto a reponer: el más escaso en picking que tenga reserva en la zona.
    const pickCount: Record<string, number> = {};
    for (const pid of state.pickingByTemp[zone === 'seco' ? 'dry' : zone === 'frio' ? 'cool' : 'frozen']) {
      const sku = state.paletById[pid]?.sku ?? '';
      pickCount[sku] = (pickCount[sku] ?? 0) + 1;
    }
    // Reserva más cercana de cada producto (arriba o en el rack de al lado).
    const nearestReserve = new Map<string, { loc: string; d: number }>();
    for (const loc of Object.keys(state.rackOccupancy)) {
      const slot = state.slotPos[loc];
      if (!slot || slot.zoneId !== zone || slot.level < 1) continue;
      const p = state.paletById[state.rackOccupancy[loc]];
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
    state.freeL0ByZone[zone].shift();
    state.tasks.push({
      id: nextTaskId('TSK'),
      kind: 'replenish',
      machineKind: 'retractil',
      from: { x: state.slotPos[reserveEntry].x, z: state.slotPos[reserveEntry].z },
      to: { x: toSlot.x, z: toSlot.z },
      fromLocId: reserveEntry,
      toLocId: freeL0,
      paletIds: [state.rackOccupancy[reserveEntry]],
      duration: 5 + nextRandom(state) * 3,
      state: 'queued',
    });
  }
}

export function tick(state: SimState, deps: SimDeps, dt: number) {
  state.ts += dt;

  // Cambio de turno.
  const period = shiftAt(state.ts);
  if (period.id !== state.shiftId) {
    const prev = state.shiftId;
    state.shiftId = period.id;
    state.lastShiftChange = state.ts;
    emitEvent(state, 'shift_change', `Cambio de turno: ${prev} → ${period.id}`);
  }

  // Camiones nuevos.
  const spawned = updateInboundSpawns(state);
  spawnOutboundIfRoom(state);
  void spawned;

  // Máquinas.
  const ctx: MachineTickCtx = { active: state.machines.filter((m) => m.taskId !== null && m.kind !== 'frontal').length };
  for (const m of state.machines) updateMachine(state, deps, m, dt, ctx);

  // Camiones.
  for (const t of [...state.trucks]) {
    updateTruck(state, deps, t, dt);
    if (t.status === 'done') {
      state.trucks = state.trucks.filter((x) => x !== t);
    }
  }

  // Limpieza de tareas terminadas.
  state.tasks = state.tasks.filter((t) => t.state !== 'done');

  // La generación de trabajo se espacia para no escanear índices en cada paso.
  state.genTimer += dt;
  if (state.genTimer >= 0.5) {
    state.genTimer = 0;
    generateWork(state, deps);
  }
}

export function makeDeps(layout: WarehouseLayout): SimDeps {
  const byAisle = new Map<string, { xCenter: number; zMin: number; zMax: number }>();
  for (const line of layout.rackLines) {
    const existing = byAisle.get(line.aisleId) ?? { xCenter: line.xCenter, zMin: Infinity, zMax: -Infinity };
    for (const seg of line.segments) {
      existing.zMin = Math.min(existing.zMin, seg.zStart);
      existing.zMax = Math.max(existing.zMax, seg.zEnd);
    }
    byAisle.set(line.aisleId, existing);
  }
  const aisles = [...byAisle.entries()].map(([id, a]) => ({ id, ...a }));
  return {
    layout,
    indoor: new PathFinder(layout.indoorGraph, rackRects(layout.rackLines)),
    yard: new PathFinder(layout.yardGraph),
    dispatch: simpleDispatch,
    aisles,
  };
}