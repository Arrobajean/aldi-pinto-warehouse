// Banco de pruebas de la simulación (fase 2 del plan de rendimiento, paso 0).
// Uso: npx --yes tsx --tsconfig tsconfig.json scripts/bench-sim.ts [horas=4] [semilla]
// Mide el coste de `tick` por hora simulada y calcula una huella del estado final: si cambia tras una
// optimización, el comportamiento de la simulación ha cambiado.
import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';
import type { SimState } from '../src/lib/sim/types';

const hours = Number(process.argv[2] ?? 4);
const seed = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;

/** FNV-1a de 32 bits sobre una cadena. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Huella del estado: lo que cambia si la simulación se comporta distinto. */
function fingerprint(s: SimState): string {
  const machines = s.machines.map((m) => [m.id, m.pos.x, m.pos.z, m.status, m.taskId, m.battery]);
  const trucks = s.trucks.map((t) => [t.id, t.pos.x, t.pos.z, t.status]);
  const tasks = s.tasks.map((t) => [t.id, t.state]);
  const racks = Object.entries(s.rackOccupancy).sort(([a], [b]) => (a < b ? -1 : 1));
  return fnv1a(JSON.stringify({ ts: s.ts, rng: s.rngState, machines, trucks, tasks, racks, stats: s.stats }));
}

const layout = buildPintoLayout();
for (const c of layout.consolidation as { pickupPoint?: unknown; dropPoint: unknown }[]) c.pickupPoint ??= c.dropPoint;
const deps = makeDeps(layout);
const state = createInitialState(layout, seed);

const TICK = 0.1;
const totalTicks = Math.round(hours * 3600 / TICK);
const perHour = new Map<number, number[]>();
let worst = { ms: 0, ts: 0 };
const started = performance.now();

for (let i = 0; i < totalTicks; i++) {
  const t0 = performance.now();
  tick(state, deps, TICK);
  const ms = performance.now() - t0;
  const hour = Math.floor(state.ts / 3600);
  const bucket = perHour.get(hour) ?? [];
  bucket.push(ms);
  perHour.set(hour, bucket);
  if (ms > worst.ms) worst = { ms, ts: state.ts };
}

const elapsed = performance.now() - started;
console.log(`Simuladas ${hours} h (${totalTicks} ticks) en ${Math.round(elapsed)} ms reales. Semilla: ${seed ?? 'por defecto'}`);
console.log('hora  ticks  media(ms)  p99(ms)  peor(ms)');
for (const [hour, times] of [...perHour].sort(([a], [b]) => a - b)) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const peak = sorted[sorted.length - 1] ?? 0;
  console.log(`${String(hour).padStart(4)}  ${String(times.length).padStart(5)}  ${mean.toFixed(3).padStart(9)}  ${p99.toFixed(2).padStart(7)}  ${peak.toFixed(1).padStart(8)}`);
}
console.log(`Peor tick: ${worst.ms.toFixed(1)} ms a las ${formatSimTime(worst.ts)}`);
console.log(`Final ${formatSimTime(state.ts)}: palés=${Object.keys(state.paletById).length} tareas=${state.tasks.length} camiones=${state.trucks.length} máquinas=${state.machines.length}`);
console.log(`HUELLA ${fingerprint(state)}`);
