import type { SimEvent, SimEventType, SimState } from '@/lib/sim/types';
import { formatSimTime } from '@/lib/sim/clock';

let nextId = 0;

/** Emite un evento tipado con el timestamp de simulación del estado. */
export function emitEvent(state: SimState, type: SimEventType, message: string, meta?: Record<string, unknown>): SimEvent {
  const ev: SimEvent = {
    ts: state.ts,
    type,
    message,
    ...(meta ? { meta } : {}),
  };
  state.events.push(ev);
  // Mantiene el feed acotado.
  if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
  return ev;
}

export function fmt(ev: SimEvent): string {
  return `${formatSimTime(ev.ts)} ${ev.message}`;
}

export function nextTaskId(prefix: string): string {
  nextId++;
  return `${prefix}-${String(nextId).padStart(4, '0')}`;
}

export function resetEventIds() {
  nextId = 0;
}