/** Playas de consolidación y palés de cada muelle en el circuito de preparación. (extraído de tick.ts) */
import type { ConsolidationArea, ConsolidationLane } from '@/lib/layout/types';
import { type SimDeps } from '@/lib/sim/deps';
import type { Pallet, Point, SimState } from '@/lib/sim/types';

export const TEMPS: Pallet['temp'][] = ['dry', 'cool', 'frozen'];

/** Paso entre palés de una calle (1,2 m de europalé más holgura). */
export const CONS_PITCH = 1.3;
/** Media longitud del europalé: el centro del palé que toca la entrada queda a esta distancia del borde de la calle. */
const PALLET_HALF_LEN = 0.6;

/**
 * Palés que caben en una calle sin salirse de la playa. La entrega entra por la cabecera de la calle (`lane.x`, `lane.z`)
 * y la fila se apila hacia el fondo, que es por donde la transpaleta recoge.
 */
export function consolidationCapacity(lane: ConsolidationLane): number {
  return Math.floor((lane.length - 2 * PALLET_HALF_LEN) / CONS_PITCH) + 1;
}

/** Centro del palé `i` de la fila: el 0 es el primero que llegó y queda en el fondo; los siguientes, hacia la cabecera. */
export function consolidationSlotPos(lane: ConsolidationLane, i: number): Point {
  const fromEnd = PALLET_HALF_LEN + i * CONS_PITCH;
  return { x: lane.x + lane.dirX * (lane.length - fromEnd), z: lane.z + lane.dirZ * (lane.length - fromEnd) };
}

/** ¿Hay en curso una recogida de palés de esta fila? Mientras tanto no se entrega nada en ella (la fila no cambia). */
export function rowBusy(state: SimState, dockId: string, areaId: string): boolean {
  const slot = state.consolidation[consolidationKey(dockId, areaId)];
  if (!slot) return false;
  return state.tasks.some((t) => t.kind === 'transfer' && !t.consolidate && t.state !== 'done' && t.paletIds.some((pid) => slot.paletIds.includes(pid)));
}

/** Recoloca los palés de la calle de la playa según su orden, para que la fila quede pegada al fondo. */
export function restackLane(state: SimState, slot: { paletIds: string[] }, lane: ConsolidationLane) {
  slot.paletIds.forEach((pid, i) => {
    const p = state.paletById[pid];
    if (p) p.pos = consolidationSlotPos(lane, i);
  });
}

/** Huecos libres de una calle reservada para un muelle, contando lo que ya viene de camino hacia ella. */
export function consolidationRoom(state: SimState, area: ConsolidationArea, dockId: string): number {
  const slot = state.consolidation[consolidationKey(dockId, area.id)];
  const lane = area.lanes.find((l) => l.id === slot?.laneId);
  if (!slot || !lane) return 0;
  let inFlight = 0;
  for (const t of state.tasks) {
    if (t.kind === 'transfer' && t.consolidate === area.id && t.dockId === dockId && t.state !== 'done') inFlight += t.paletIds.length;
  }
  return consolidationCapacity(lane) - slot.paletIds.length - inFlight;
}

/**
 * Palés por temperatura que ya están en el circuito de un muelle (lane, flejado, transferencia y recogidas). Cada
 * palé cuenta una vez y para el muelle de su pedido (`dockId` del palé desde que se prepara): una transferencia puede
 * llevar palés de varios muelles y una playa conserva los suyos mientras van de camino al muelle.
 */
export function dockTempCounts(state: SimState, dockId: string): Record<Pallet['temp'], number> {
  const c: Record<Pallet['temp'], number> = { dry: 0, cool: 0, frozen: 0 };
  const seen = new Set<string>();
  const add = (ids: string[]) => {
    for (const pid of ids) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const p = state.paletById[pid];
      if (p && p.dockId === dockId) c[p.temp]++;
    }
  };
  add(state.lanePallets[dockId] ?? []);
  for (const st of state.strappers) {
    for (const e of st.queue) add(e.paletIds);
    if (st.current) add(st.current.paletIds);
  }
  for (const e of state.strapOut) add(e.paletIds);
  for (const slot of Object.values(state.consolidation)) add(slot.paletIds);
  for (const t of state.tasks) {
    if (t.state === 'done') continue;
    if (t.kind === 'transfer') add(t.paletIds);
    else if (t.kind === 'pick' && t.dockId === dockId) {
      // Aún en el rack: su `dockId` es el de recepción, cuenta el de la recogida.
      for (const pid of t.paletIds) {
        if (seen.has(pid)) continue;
        seen.add(pid);
        const p = state.paletById[pid];
        if (p) c[p.temp]++;
      }
    }
  }
  return c;
}

/** Calle de la playa de consolidación por id. */
export function consolidationLane(deps: SimDeps, laneId: string | undefined) {
  if (!laneId) return undefined;
  for (const area of deps.layout.consolidation) {
    const lane = area.lanes.find((l) => l.id === laneId);
    if (lane) return lane;
  }
  return undefined;
}

/** Clave de la reserva de playa de un pedido: muelle y playa. */
export function consolidationKey(dockId: string, areaId: string): string {
  return `${dockId}|${areaId}`;
}

/** Temperaturas que admite una playa (`temps` del plano; sin él, la playa es de seco). */
export function areaTemps(area: ConsolidationArea): Pallet['temp'][] | undefined {
  return 'temps' in area ? (area as { temps?: Pallet['temp'][] }).temps : undefined;
}

/** Playa de consolidación de una categoría térmica (sin `temps`, la única playa es la de seco). */
export function consolidationAreaFor(deps: SimDeps, temp: Pallet['temp']) {
  return deps.consolidationByTemp.get(temp);
}

/**
 * Reserva (o reutiliza) la calle de la playa para el pedido del muelle. False si todas sus calles están ocupadas.
 * `used`: calles ya reservadas (se actualiza).
 */
export function claimConsolidationLane(state: SimState, area: ConsolidationArea, dockId: string, used: Set<string>): boolean {
  const key = consolidationKey(dockId, area.id);
  if (state.consolidation[key]) return true;
  const lane = area.lanes.find((l) => !used.has(l.id));
  if (!lane) return false;
  state.consolidation[key] = { dockId, areaId: area.id, laneId: lane.id, paletIds: [] };
  used.add(lane.id);
  return true;
}

/** Categoría térmica de una sección de preparación. */
export function sectionTemp(section: string): Pallet['temp'] {
  return section === 'Frío' ? 'cool' : section === 'Congelado' ? 'frozen' : 'dry';
}

/** ¿Queda parte del pedido de este muelle, de las temperaturas de una playa, por preparar, flejar o traer a ella? */
export function consolidationPending(state: SimState, dockId: string, area: ConsolidationArea): boolean {
  const temps = areaTemps(area) ?? ['dry'];
  const tempsSet = new Set(temps);
  const ofArea = (ids: string[]) => ids.some((pid) => tempsSet.has(state.paletById[pid]?.temp ?? 'dry'));
  for (const t of state.tasks) {
    if (t.dockId !== dockId || t.state === 'done') continue;
    if (t.kind === 'pick' && ofArea(t.paletIds)) return true;
    if (t.kind === 'transfer' && t.consolidate === area.id) return true;
  }
  for (const st of state.strappers) {
    if (st.queue.some((e) => e.dockId === dockId && ofArea(e.paletIds))) return true;
    if (st.current?.dockId === dockId && ofArea(st.current.paletIds)) return true;
  }
  if (state.strapOut.some((e) => e.dockId === dockId && ofArea(e.paletIds))) return true;
  // Partes del pedido de ese muelle (el atracado o el que se prepara por adelantado) aún sin mandar a preparar.
  const truck = state.trucks.find((t) => t.dockId === dockId && t.status === 'at_dock' && t.direction === 'outbound');
  const orderId = truck?.orderId ?? state.demand.orders.find((o) => o.dockId === dockId && state.pickRemaining[o.id] && !state.outboundDone.includes(o.id))?.id;
  const remaining = orderId ? state.pickRemaining[orderId] : undefined;
  if (remaining) {
    for (const [section, left] of Object.entries(remaining)) if (left > 0 && tempsSet.has(sectionTemp(section))) return true;
  }
  return false;
}
