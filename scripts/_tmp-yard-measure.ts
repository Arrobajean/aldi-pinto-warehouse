import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';
import { circlesGap, truckCircles, truckParked } from '../src/lib/sim/traffic';

// Medición temporal del patio: solapes de huellas (criterio de check-traffic) y bloqueos al final.
const hours = Number(process.argv[2] ?? 4);
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const end = s.ts + hours * 3600;
let samples = 0;
const overlapSince = new Map<string, number>();
const longest = { sec: 0, key: '', at: '' };
const pairs = new Set<string>();
let step = 0;
let maxWait = 0;
let maxWaitAt = '';
while (s.ts < end) {
  tick(s, deps, 0.1);
  step++;
  if (step % 10 !== 0) continue;
  samples++;
  const onSite = s.trucks.filter((t) => t.status !== 'offsite' && t.status !== 'done');
  const now = new Set<string>();
  for (let a = 0; a < onSite.length; a++) {
    for (let b = a + 1; b < onSite.length; b++) {
      const ta = onSite[a];
      const tb = onSite[b];
      if (truckParked(ta) && truckParked(tb)) continue;
      if (Math.hypot(ta.pos.x - tb.pos.x, ta.pos.z - tb.pos.z) > 25) continue;
      if (circlesGap(truckCircles(ta.pos.x, ta.pos.z, ta.heading), truckCircles(tb.pos.x, tb.pos.z, tb.heading)) >= 0) continue;
      const key = [ta.id, tb.id].sort().join('|');
      now.add(key);
      pairs.add(key);
      const since = overlapSince.get(key) ?? s.ts;
      overlapSince.set(key, since);
      if (s.ts - since > longest.sec) Object.assign(longest, { sec: s.ts - since, key, at: formatSimTime(since) });
    }
  }
  for (const k of [...overlapSince.keys()]) if (!now.has(k)) overlapSince.delete(k);
  for (const t of s.trucks) if (t.waitTimer > maxWait) { maxWait = t.waitTimer; maxWaitAt = `${t.id} ${formatSimTime(s.ts)} ${t.status}/${t.stage ?? '-'}`; }
}
const stuck = s.trucks.filter((t) => t.waitTimer > 300 && t.status !== 'offsite' && t.status !== 'done').map((t) => `${t.id}(${t.status}/${t.stage ?? '-'} ${t.waitTimer.toFixed(0)}s)`);
const onSiteEnd = s.trucks.filter((t) => t.status !== 'offsite' && t.status !== 'done').length;
console.log(JSON.stringify({
  hasta: formatSimTime(s.ts),
  muestrasConSolape: '(ver pares)',
  paresQueSeSolapan: pairs.size,
  solapeMasLargo_s: longest.sec,
  parMasLargo: longest.key,
  desde: longest.at,
  esperaMaxS: Math.round(maxWait),
  esperaMax: maxWaitAt,
  atascadosFinal: stuck,
  enPatioFinal: onSiteEnd,
  stats: s.stats,
}, null, 1));
