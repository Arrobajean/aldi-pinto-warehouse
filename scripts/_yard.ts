import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const until = Number(process.argv[2] ?? 13) * 3600;
while (s.ts < until) tick(s, deps, 0.1);
for (const t of s.trucks) console.log(t.id, t.direction, t.status, t.stage, t.dockId, t.stallId, t.pos.x.toFixed(1), t.pos.z.toFixed(1), 'v', t.v.toFixed(2), 'route', t.route.length, 'wait', t.waitTimer?.toFixed?.(0), JSON.stringify((t as any).zones ?? (t as any).holds ?? ''));
console.log('free docks', s.dockStates.filter((d) => d.state === 'free').map((d) => d.dockId).join(','));
const z = (s as any).truckZones ?? (s as any).zones; console.log('zones', JSON.stringify(z)?.slice(0, 1500));
import { truckFreeDistance } from '../src/lib/sim/traffic';
console.log('claims', s.zoneClaims.map((c) => `${c.id}:${c.owner}:${c.entered}`).join(' '));
for (const t of s.trucks) {
  if (t.status === 'at_dock' || t.status === 'offsite' || t.status === 'done') continue;
  const why = { reason: '' };
  const rev = t.stage === 'reverse' || t.stage === 'unpark';
  const d = truckFreeDistance(s, t, rev, 1.5, false, undefined, why);
  console.log(t.id, t.status, t.stage, 'wait', t.waitTimer.toFixed(0), 'free', d, why.reason, 'h', t.heading.toFixed(2), 'r', JSON.stringify(t.route.slice(0,4).map(p=>[+p.x.toFixed(1),+p.z.toFixed(1)])));
}
import { truckCircles, circlesGap } from '../src/lib/sim/traffic';
const A = s.trucks.find((t) => t.id === process.argv[3]);
const B = s.trucks.find((t) => t.id === process.argv[4]);
if (A && B) console.log('gap', circlesGap(truckCircles(A.pos.x, A.pos.z, A.heading), truckCircles(B.pos.x, B.pos.z, B.heading)), truckCircles(A.pos.x, A.pos.z, A.heading), truckCircles(B.pos.x, B.pos.z, B.heading));
