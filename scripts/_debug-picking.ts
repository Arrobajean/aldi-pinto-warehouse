import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout, 20260301);
let vistos = 0; let kinds: Record<string, number> = {}; let prevPrep = 0; let ejemplo: unknown = null;
console.log("ts inicial", s.ts); while (s.ts < 6.5 * 3600) {
  tick(s, deps, 0.1);
  for (const t of s.tasks) kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
  if (s.stats.prepared > prevPrep && !ejemplo) { ejemplo = { prepared: s.stats.prepared, tasks: s.tasks.map((t) => [t.kind, t.state]) }; }
  prevPrep = s.stats.prepared;
  vistos++;
}
console.log('ticks', vistos, 'kinds acumulados', kinds);
console.log('stats', JSON.stringify(s.stats));
console.log('ejemplo', JSON.stringify(ejemplo)?.slice(0, 600));
console.log('tareas al final', s.tasks.length, 'maquinas con tarea', s.machines.filter((m) => m.taskId).length);
