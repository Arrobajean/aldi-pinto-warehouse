import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';
import { truckFreeDistance, GHOST_PATIENCE, STUCK_PATIENCE } from '../src/lib/sim/traffic-free';
import { maneuvering } from '../src/lib/sim/truck-motion';
import { stallZone, dockZoneOf } from '../src/lib/sim/traffic-zones';
import { stallByKey } from '../src/lib/sim/truck-stalls';
import { TRUCK_BIKE } from '../src/lib/sim/vehicle';
import type { Truck } from '../src/lib/sim/types';

// Diagnóstico temporal: qué bloquea a cada camión parado (motivo de la distancia libre).
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const reportAt = new Set<number>();
let reports = 0;
const START = 9 * 3600 + 15 * 60;
while (s.ts < 10 * 3600 && reports < 2) {
  tick(s, deps, 0.1);
  if (s.ts < START) continue;
  const stuck = s.trucks.filter((t) => t.waitTimer > 60 && t.status !== 'at_dock' && t.status !== 'offsite' && t.status !== 'done');
  if (stuck.length === 0) continue;
  const key = Math.floor(s.ts / 300);
  if (reportAt.has(key)) continue;
  reportAt.add(key);
  reports++;
  console.log(`== ${formatSimTime(s.ts)} atascados (>60 s): ${stuck.length}`);
  for (const t of stuck) {
    const stall = stallByKey(layout, t.stallId);
    const own = t.status === 'parking' && stall ? { id: `M-${t.stallId}`, rect: stallZone(stall, true) } : t.dockId ? (() => { const d = layout.docks.find((x) => x.id === t.dockId); return d ? dockZoneOf(d) : undefined; })() : undefined;
    const why = { reason: '' };
    const reverse = t.stage === 'reverse' || t.stage === 'unpark';
    const free = truckFreeDistance(s, t, reverse, TRUCK_BIKE.brake, maneuvering(s, t), own, why, t.waitTimer > STUCK_PATIENCE);
    console.log(`  ${t.id} ${t.status}/${t.stage ?? '-'} wait=${t.waitTimer.toFixed(0)} v=${t.v.toFixed(2)} pos=(${t.pos.x.toFixed(1)},${t.pos.z.toFixed(1)}) libre=${free === Infinity ? '∞' : free.toFixed(1)} motivo: ${why.reason || '-'} dir=${t.direction}`);
  }
  const claims = s.zoneClaims.map((c) => `${c.id}:${c.owner}${c.entered ? '(dentro)' : ''}`).join(' ');
  console.log('  reservas:', claims || '-');
}
console.log('ghost', GHOST_PATIENCE, 'stuck', STUCK_PATIENCE, formatSimTime(s.ts));
