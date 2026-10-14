import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const until = Number(process.argv[2] ?? 14) * 3600;
while (s.ts < until) tick(s, deps, 0.1);
for (const t of s.trucks.filter((t) => t.direction === 'outbound' && t.status === 'at_dock')) {
  const ds = s.dockStates.find((d) => d.dockId === t.dockId)!;
  const tasks = s.tasks.filter((k) => k.dockId === t.dockId && k.state !== 'done').map((k) => `${k.kind}/${k.state}/${k.machineKind}/${k.section ?? ''}/${k.consolidate ?? ''}/${k.paletIds.length}`);
  const cons = Object.values(s.consolidation).filter((c) => c.dockId === t.dockId).map((c) => `${c.areaId}:${c.paletIds.length}`);
  const strap = s.strapOut.filter((e) => e.dockId === t.dockId).map((e) => e.paletIds.length);
  console.log(t.id, t.dockId, t.temp, `loaded ${t.paletsLoaded}/${ds.totalPalets}`, 'lane', (s.lanePallets[t.dockId!] ?? []).length, 'rem', JSON.stringify(s.pickRemaining[t.orderId!]), 'cons', cons.join(','), 'strapOut', strap.join(','), 'tasks', tasks.join(' '));
}
const byState = s.pallets.reduce((a: Record<string, number>, p) => ((a[p.state] = (a[p.state] ?? 0) + 1), a), {});
console.log('pallets', JSON.stringify(byState));
console.log('strappers', JSON.stringify(s.strappers));
console.log('machines', s.machines.map((m) => `${m.id}:${m.kind}:${m.status}:${(m as any).sections ?? ''}:${(m as any).taskId ?? ''}`).join(' '));
