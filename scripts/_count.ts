import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
for (const h of [8, 10]) {
  while (s.ts < h * 3600) tick(s, deps, 0.1);
  const by = s.tasks.reduce((a: Record<string, number>, t) => ((a[`${t.kind}/${t.state}`] = (a[`${t.kind}/${t.state}`] ?? 0) + 1), a), {});
  console.log(h, s.tasks.length, JSON.stringify(by), 'strapOut', s.strapOut.length, 'cons', Object.keys(s.consolidation).length, 'orders', s.demand.orders.length, 'staging', s.stagingQueue.length);
}
