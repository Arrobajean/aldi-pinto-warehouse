import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';

const layout = buildPintoLayout();
const deps = makeDeps(layout);

function run(seed: number, targetTs: number) {
  const state = createInitialState(layout, seed);
  let steps = 0;
  const maxSteps = 10e6;
  while (state.ts < targetTs && steps < maxSteps) {
    tick(state, deps, 0.1);
    steps++;
  }
  return state;
}

console.log('Simulación 04:00 → 16:00 (12 h simuladas)…');

const a = run(20260301, 16 * 3600);
const b = run(20260301, 16 * 3600); // determinismo: misma semilla

const sig = (s: typeof a) =>
  JSON.stringify({
    ts: s.ts,
    machines: s.machines.length,
    trucks: s.trucks.length,
    palets: s.pallets.length,
    tasks: s.tasks.filter((t) => t.state !== 'done').length,
    stats: s.stats,
    shiftId: s.shiftId,
  });

const sa = sig(a);
const sb = sig(b);

console.log('Firma A:', sa);
console.log('Determinista (A==B):', sa === sb);

console.log('Camiones en ruta (fin):', a.trucks.length);
console.log(
  'Eventos destacados:',
  a.events.filter((e) => e.type === 'truck_left').length,
  'salidas ·',
  a.events.filter((e) => e.type === 'pallet_stored').length,
  'ubicados ·',
  a.events.filter((e) => e.type === 'pallet_prepared').length,
  'preparados',
);

for (const key of ['received', 'stored', 'picked', 'prepared', 'shipped', 'trucksOut'] as const) {
  console.log(`${key.padEnd(10)}: ${a.stats[key]}`);
}

const log = (msg: string) => console.log(msg);
log(`Fin de simulación: ${formatSimTime(a.ts)} · eventos: ${a.events.length}`);