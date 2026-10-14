/** Máquinas sin tarea: plazas de sala, carga, pasillos y espera entre tareas. (extraído de tick.ts) */
import type { RoomSpot } from '@/lib/layout/types';
import { type SimDeps } from '@/lib/sim/deps';
import { consolidationSlotPos } from '@/lib/sim/consolidation';
import { moveAlong } from '@/lib/sim/machine-motion';
import { aisleAt } from '@/lib/sim/machine-routes';
import { dockInteriorPoint, stagingPoint } from '@/lib/sim/positions';
import { type Machine, type Point, type SimState, shiftAt } from '@/lib/sim/types';

/** Batería por debajo de la cual la máquina va a cargar. */
export const CHARGE_THRESHOLD = 22;

/** Batería a partir de la cual la carga termina. */
export const CHARGED_LEVEL = 99.5;

/** Libera el pasillo reservado. Sin esto, una máquina parada en un pasillo bloquea a las demás. */
export function releaseAisle(state: SimState, m: Machine) {
  if (!m.aisleReserved) return;
  const rest = (state.aisleLocks[m.aisleReserved] ?? []).filter((id) => id !== m.id);
  if (rest.length > 0) state.aisleLocks[m.aisleReserved] = rest;
  else delete state.aisleLocks[m.aisleReserved];
  m.aisleReserved = null;
}

/** Libera la plaza de sala de la máquina (al salir a trabajar o al terminar de cargar). */
export function releaseSpot(state: SimState, m: Machine) {
  if (m.spot && state.spotOccupancy[m.spot] === m.id) delete state.spotOccupancy[m.spot];
  m.spot = null;
  m.mission = null;
}

export function spotById(deps: SimDeps, id: string | null): RoomSpot | null {
  if (!id) return null;
  for (const room of deps.layout.rooms) for (const spot of room.spots) if (spot.id === id) return spot;
  return null;
}

/**
 * Plaza libre más cercana de un tipo: reposo (la sala anexa, único aparcamiento de la flota) o carga (sala de carga).
 */
export function findFreeSpot(state: SimState, deps: SimDeps, kind: 'reposo' | 'carga', m: Machine): RoomSpot | null {
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
export function arriveAtSpot(m: Machine) {
  m.heading = -Math.PI / 2;
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
export function updateIdle(state: SimState, deps: SimDeps, m: Machine, dt: number) {
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
  // Entre tareas, en turno y con batería, el operario espera donde ha terminado (si no estorba en un pasillo ni
  // en un cruce) hasta IDLE_GRACE segundos antes de volver a aparcar: la siguiente tarea suele llegar enseguida.
  m.idleSince ??= state.ts;
  const inWay = aisleAt(deps, m.pos.x, m.pos.z) !== null || nearSharedPoint(deps, m.pos);
  if (shiftAt(state.ts).id !== 'noche' && m.battery >= CHARGE_THRESHOLD && !inWay && state.ts - m.idleSince < IDLE_GRACE) return;
  let kind: 'reposo' | 'carga' = m.battery < CHARGE_THRESHOLD ? 'carga' : 'reposo';
  let spot = findFreeSpot(state, deps, kind, m);
  // Sin cargador libre, espera en una plaza de reposo (nunca parada en un pasillo, donde estorbaría).
  if (!spot && kind === 'carga') {
    kind = 'reposo';
    spot = findFreeSpot(state, deps, kind, m);
  }
  if (!spot) return;
  state.spotOccupancy[spot.id] = m.id;
  m.spot = spot.id;
  m.mission = kind === 'carga' ? 'charge' : 'park';
  m.route = [{ x: spot.x, z: spot.z }];
  m.status = 'traveling';
  if (m.route.length === 0) arriveAtSpot(m);
}

/** Separación mínima entre dos máquinas que dejan su plaza de la sala (s). */
export const SPOT_RELEASE_GAP = 3;

/** ¿Está junto a un punto compartido (flejadora, playa, calle de muelle)? Ahí no se espera entre tareas. */
export function nearSharedPoint(deps: SimDeps, p: Point): boolean {
  const pts: Point[] = [];
  for (const st of deps.layout.strappers) pts.push(st.input, st.output);
  for (const c of deps.layout.consolidation) {
    pts.push(c.dropPoint);
    for (const l of c.lanes) pts.push(consolidationSlotPos(l, 0));
  }
  for (const d of deps.layout.docks) pts.push(stagingPoint(d), dockInteriorPoint(d));
  return pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 10);
}

/** Espera máxima entre tareas en el último puesto antes de volver a la sala (s). */
export const IDLE_GRACE = 300;
