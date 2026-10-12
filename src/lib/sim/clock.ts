import type { SimState } from '@/lib/sim/types';

export const SIM_START_TS = 4 * 3600; // 04:00
export const TICK_STEP = 0.1; // s de simulación por paso fijo

/** Avanza la simulación con paso fijo de 0,1 s y acumulador en el estado. */
export function advance(state: SimState, realDt: number, tick: (state: SimState, dt: number) => void, maxSteps = 4000) {
  if (!state.running || state.speed === 0) return 0;
  let simSeconds = realDt * state.speed;
  let steps = 0;
  while (simSeconds > 1e-9 && steps < maxSteps) {
    const dt = Math.min(TICK_STEP, simSeconds);
    tick(state, dt);
    simSeconds -= dt;
    steps++;
  }
  return steps;
}

export function formatSimTime(ts: number): string {
  const s = Math.floor(ts);
  const hh = Math.floor(s / 3600) % 24;
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}