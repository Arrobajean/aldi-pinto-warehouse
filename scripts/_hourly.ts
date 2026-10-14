import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { navStats } from '../src/lib/sim/navigator';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
let t0 = performance.now();
let last = { ...navStats };
for (let h = 7; h <= Number(process.argv[2] ?? 14); h++) {
  while (s.ts < h * 3600) tick(s, deps, 0.1);
  const d = Object.fromEntries(Object.entries(navStats).map(([k, v]) => [k, v - (last as any)[k]]));
  last = { ...navStats };
  const q = s.tasks.filter((t) => t.state === 'queued').reduce((a: Record<string, number>, t) => ((a[t.kind] = (a[t.kind] ?? 0) + 1), a), {});
  const st = s.machines.reduce((a: Record<string, number>, m) => ((a[m.status] = (a[m.status] ?? 0) + 1), a), {});
  console.log(`${h}:00 ms ${(performance.now() - t0).toFixed(0)} nav ${JSON.stringify(d)} cola ${JSON.stringify(q)} maq ${JSON.stringify(st)} camiones ${s.trucks.length} atracados ${s.trucks.filter((t) => t.status === 'at_dock').length} stats ${JSON.stringify(s.stats)}`);
  t0 = performance.now();
}
