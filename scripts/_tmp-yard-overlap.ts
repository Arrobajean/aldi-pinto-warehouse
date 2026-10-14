import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';
import { circlesGap, truckCircles, truckParked } from '../src/lib/sim/traffic';
import type { Truck } from '../src/lib/sim/types';

// Diagnóstico temporal: solapes de huellas de camiones (mismo criterio que check-traffic.ts).
const END_TS = Number(process.argv[2] ?? 10) * 3600;
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);

type Ep = { key: string; first: number; last: number; samples: number; minGap: number; info: string[] };
const eps = new Map<string, Ep>();
const fmt = (t: Truck) =>
  `${t.id} st=${t.status}/${t.stage ?? '-'} pos=(${t.pos.x.toFixed(1)},${t.pos.z.toFixed(1)}) h=${t.heading.toFixed(2)} v=${t.v.toFixed(2)} ` +
  `route=${t.route.length}[${t.route.length ? `${t.route[0].x.toFixed(1)},${t.route[0].z.toFixed(1)}→${t.route[t.route.length - 1].x.toFixed(1)},${t.route[t.route.length - 1].z.toFixed(1)}` : ''}] ` +
  `dock=${t.dockId ?? '-'} from=${t.fromDockId ?? '-'} stall=${t.stallId ?? '-'} wait=${t.waitTimer.toFixed(0)} dir=${t.direction}`;

let step = 0;
while (s.ts < END_TS) {
  tick(s, deps, 0.1);
  step++;
  if (step % 10 !== 0) continue;
  const onSite = s.trucks.filter((t) => t.status !== 'offsite' && t.status !== 'done');
  const seen = new Set<string>();
  for (let a = 0; a < onSite.length; a++) {
    for (let b = a + 1; b < onSite.length; b++) {
      const ta = onSite[a];
      const tb = onSite[b];
      if (truckParked(ta) && truckParked(tb)) continue;
      if (Math.hypot(ta.pos.x - tb.pos.x, ta.pos.z - tb.pos.z) > 25) continue;
      const gap = circlesGap(truckCircles(ta.pos.x, ta.pos.z, ta.heading), truckCircles(tb.pos.x, tb.pos.z, tb.heading));
      if (gap >= 0) continue;
      const [x, y] = ta.id < tb.id ? [ta, tb] : [tb, ta];
      const key = `${x.id}|${y.id}`;
      seen.add(key);
      let e = eps.get(key);
      if (!e) {
        e = { key, first: s.ts, last: s.ts, samples: 0, minGap: gap, info: [] };
        eps.set(key, e);
        e.info.push(`  INICIO ${formatSimTime(s.ts)} gap=${gap.toFixed(2)}\n    ${fmt(x)}\n    ${fmt(y)}`);
      }
      e.last = s.ts;
      e.samples++;
      e.minGap = Math.min(e.minGap, gap);
    }
  }
}

const list = [...eps.values()].sort((p, q) => q.samples - p.samples);
console.log(`Pares que se solapan: ${list.length} · muestras totales: ${list.reduce((n, e) => n + e.samples, 0)}`);
for (const e of list.slice(0, 25)) {
  console.log(`${e.key} · ${e.samples} muestras (${(e.samples / 1).toFixed(0)} s) · ${formatSimTime(e.first)}→${formatSimTime(e.last)} · gap mín ${e.minGap.toFixed(2)}`);
  console.log(e.info[0]);
}
