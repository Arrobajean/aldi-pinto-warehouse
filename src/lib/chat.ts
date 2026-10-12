import type { SimState } from '@/lib/sim/types';

/** Snapshot compacto y serializable del estado en vivo que ve el asistente. */
export interface LiveSnapshot {
  gen: number;
  ts: number;
  machines: { id: string; kind: string; status: string; battery: number; speed: number; x: number; z: number; task?: string }[];
  trucks: { id: string; plate: string; direction: string; status: string; dockId: string | null; x: number; z: number; temp: string }[];
  docks: { id: string; state: string; truck: string | null; totalPalets: number }[];
  palets: { total: number; byState: Record<string, number>; byTemp: Record<string, number> };
  alerts: { ts: number; type: string; message: string }[];
  stats: { received: number; stored: number; picked: number; prepared: number; shipped: number; trucksOut: number };
}

/** Acción sugerida por el asistente para ejecutar en la UI. */
export type UiAction =
  | { type: 'focus_entity'; target: string; label?: string }
  | { type: 'focus_location'; target: string; label?: string }
  | { type: 'highlight_zone'; target: string; label?: string }
  | { type: 'open_card'; target: string; label?: string };

export interface ChatRequest {
  question: string;
  history?: { role: 'user' | 'model'; parts: string }[];
  snapshot: LiveSnapshot;
}

export interface ChatSource {
  title: string;
  category: string;
  relevance: number;
  snippet: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  ui_actions: UiAction[];
}

/** Construye el snapshot compacto del estado vivo. */
export function buildLiveSnapshot(state: SimState): LiveSnapshot {
  const byState: Record<string, number> = {};
  const byTemp: Record<string, number> = {};
  let total = 0;
  for (const p of state.pallets) {
    total++;
    byState[p.state] = (byState[p.state] ?? 0) + 1;
    byTemp[p.temp] = (byTemp[p.temp] ?? 0) + 1;
  }
  return {
    gen: 1,
    ts: Math.floor(state.ts),
    machines: state.machines.map((m) => ({
      id: m.id,
      kind: m.kind,
      status: m.status,
      battery: Math.round(m.battery),
      speed: m.speed,
      x: m.pos.x,
      z: m.pos.z,
      task: m.taskId ?? undefined,
    })),
    trucks: state.trucks.map((t) => ({
      id: t.id,
      plate: t.plate,
      direction: t.direction,
      status: t.status,
      dockId: t.dockId,
      x: t.pos.x,
      z: t.pos.z,
      temp: t.temp,
    })),
    docks: state.dockStates.map((d) => ({
      id: d.dockId,
      state: d.state,
      truck: d.truckId,
      totalPalets: d.totalPalets,
    })),
    palets: { total, byState, byTemp },
    alerts: state.events.slice(-12).map((e) => ({ ts: e.ts, type: e.type, message: e.message })),
    stats: { ...state.stats },
  };
}