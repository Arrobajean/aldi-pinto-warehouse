import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';

// Diagnóstico temporal: camiones cuyo siguiente punto de ruta está lejos de su posición (ruta obsoleta).
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
let dumped = 0;
let count = 0;
const seenIds = new Set<string>();
while (s.ts < 10 * 3600 && dumped < 4) {
  tick(s, deps, 0.1);
  for (const t of s.trucks) {
    if (t.status !== 'leaving' || t.route.length === 0) continue;
    const r0 = t.route[0];
    const d = Math.hypot(r0.x - t.pos.x, r0.z - t.pos.z);
    if (d < 30) continue;
    count++;
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);
    dumped++;
    console.log(`${formatSimTime(s.ts)} ${t.id} stage=${t.stage} pos=(${t.pos.x.toFixed(1)},${t.pos.z.toFixed(1)}) h=${t.heading.toFixed(2)} v=${t.v.toFixed(2)} dist0=${d.toFixed(1)} route=${t.route.length}`);
    console.log('  primeros:', t.route.slice(0, 6).map((p) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' '));
    console.log('  últimos:', t.route.slice(-3).map((p) => `(${p.x.toFixed(1)},${p.z.toFixed(1)})`).join(' '));
    console.log('  nextRoute:', t.nextRoute.length, 'fromDock', t.fromDockId);
  }
}
console.log('muestras con ruta obsoleta:', count);
