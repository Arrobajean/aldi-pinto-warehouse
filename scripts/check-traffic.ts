import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';

// Medición de tráfico (fase 0 del plan de correcciones).
// Simula desde el inicio de turno hasta las 10:00, muestreando 1 vez por segundo simulado
// (tick = 0,1 s, así que cada 10 ticks).

const MACHINE_D = 1.5; // umbral de solape de máquinas (m)
const TRUCK_D = 6; // umbral de solape de camiones (m), fuera de at_dock
const TRUCK_D_REF = 8; // umbral de referencia usado en la línea base de 8 m
const SAMPLE_EVERY = 10;
const END_TS = 10 * 3600;

const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const startTs = s.ts;

let samples = 0;
let machinePairs = 0;
let minMachine = Infinity;
let truckPairs = 0;
let truckPairsRef = 0;
let minTruck = Infinity;
const maxByStatus: Record<string, number> = {};
const firstSeen = new Map<string, number>();
const approachSec = new Map<string, number>();

let step = 0;
while (s.ts < END_TS) {
  tick(s, deps, 0.1);
  step++;
  if (step % SAMPLE_EVERY !== 0) continue;
  samples++;

  // Camiones simultáneos por estado y tiempo de aparición.
  const counts: Record<string, number> = {};
  for (const t of s.trucks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
    if (!firstSeen.has(t.id)) firstSeen.set(t.id, s.ts);
    if (t.status === 'approaching') approachSec.set(t.id, (approachSec.get(t.id) ?? 0) + 1);
  }
  for (const [k, v] of Object.entries(counts)) maxByStatus[k] = Math.max(maxByStatus[k] ?? 0, v);

  // Camiones solapados (no atracados).
  const ts = s.trucks.filter((t) => t.status !== 'at_dock');
  for (let a = 0; a < ts.length; a++) {
    for (let b = a + 1; b < ts.length; b++) {
      const d = Math.hypot(ts[a].pos.x - ts[b].pos.x, ts[a].pos.z - ts[b].pos.z);
      minTruck = Math.min(minTruck, d);
      if (d < TRUCK_D) truckPairs++;
      if (d < TRUCK_D_REF) truckPairsRef++;
    }
  }

  // Máquinas activas solapadas.
  const ms = s.machines.filter((m) => m.status === 'traveling' || m.status === 'working' || m.status === 'waiting');
  for (let a = 0; a < ms.length; a++) {
    for (let b = a + 1; b < ms.length; b++) {
      const d = Math.hypot(ms[a].pos.x - ms[b].pos.x, ms[a].pos.z - ms[b].pos.z);
      minMachine = Math.min(minMachine, d);
      if (d < MACHINE_D) machinePairs++;
    }
  }
}

const round = (n: number, dp = 2) => (Number.isFinite(n) ? Number(n.toFixed(dp)) : null);
const approachMin = [...approachSec.values()].map((sec) => sec / 60);
const arrivals = [...firstSeen.entries()].map(([id, ts]) => `${id}@${formatSimTime(ts)}`);

console.log(`Inicio: ${formatSimTime(startTs)} · fin: ${formatSimTime(s.ts)} · muestras: ${samples}`);
console.log(
  JSON.stringify(
    {
      machinePairs_lt_1_5m: machinePairs,
      minMachine_m: round(minMachine),
      truckPairs_lt_6m_no_at_dock: truckPairs,
      truckPairs_lt_8m_no_at_dock: truckPairsRef,
      minTruck_m: round(minTruck),
      maxTrucksByStatus: maxByStatus,
      trucksSeen: firstSeen.size,
      approachMin: {
        max: round(Math.max(0, ...approachMin), 1),
        avg: round(approachMin.length ? approachMin.reduce((a, b) => a + b, 0) / approachMin.length : 0, 1),
      },
      stats: s.stats,
    },
    null,
    2,
  ),
);
console.log('Llegadas (camión@hora):', arrivals.length ? arrivals.join(' ') : '(ninguna)');
