/** Flejadoras: cola de entrada, proceso de fleje y avance de cada tren. (extraído de tick.ts) */
import { type SimDeps } from '@/lib/sim/deps';
import type { SimState } from '@/lib/sim/types';

/** Capacidad de cola de cada flejadora (palés) antes de considerarla llena. */
export const STRAP_QUEUE_LIMIT = 8;

/** Segundos por palé que tarda el preparador en flejar a mano (tren lleno). */
export const MANUAL_STRAP_SECONDS = 45;

export function strapperById(deps: SimDeps, id: string) {
  return deps.strapperById.get(id);
}

/** Flejadora con cola libre más cercana a un punto; null si todas están llenas. */
export function freeStrapper(state: SimState, deps: SimDeps, at: { x: number; z: number }) {
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
export function nearestStrapper(deps: SimDeps, at: { x: number; z: number }): string {
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
export function advanceStrapper(state: SimState, deps: SimDeps, st: SimState['strappers'][number]) {
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
