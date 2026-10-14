import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { formatSimTime } from '../src/lib/sim/clock';
import { dockApproach } from '../src/lib/layout/dock-geometry';
import { circlesGap, truckCircles, truckParked } from '../src/lib/sim/traffic';

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
let maxDockErr = 0;
let truckFootprintOverlaps = 0;
let minTruckGap = Infinity;
const overlapKinds: Record<string, number> = {};
const waitRun = new Map<string, number>();
let maxWaitRun = 0;

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
    // Aparición = entrada en la parcela (la cola exterior no cuenta).
    if (t.status !== 'offsite' && !firstSeen.has(t.id)) firstSeen.set(t.id, s.ts);
    if (t.status === 'at_dock' && t.dockId) {
      const dk = layout.docks.find((d) => d.id === t.dockId)!;
      const a = dockApproach(dk);
      maxDockErr = Math.max(maxDockErr, Math.hypot(t.pos.x - a.target.x, t.pos.z - a.target.z));
    }
    if (t.status === 'approaching') approachSec.set(t.id, (approachSec.get(t.id) ?? 0) + 1);
  }
  for (const [k, v] of Object.entries(counts)) maxByStatus[k] = Math.max(maxByStatus[k] ?? 0, v);

  // Camiones solapados (no atracados).
  // Fuera: atracados, aparcados en su plaza de espera (en paralelo a 4 m) y la cola exterior.
  const ts = s.trucks.filter((t) => t.status !== 'at_dock' && t.status !== 'offsite' && !(t.status === 'parking' && t.route.length === 0));
  for (let a = 0; a < ts.length; a++) {
    for (let b = a + 1; b < ts.length; b++) {
      const d = Math.hypot(ts[a].pos.x - ts[b].pos.x, ts[a].pos.z - ts[b].pos.z);
      minTruck = Math.min(minTruck, d);
      if (d < TRUCK_D) truckPairs++;
      if (d < TRUCK_D_REF) truckPairsRef++;
    }
  }

  // Huellas de camiones (5 círculos de 1,6 m): solapes entre cualquier par salvo dos camiones estáticos.
  const onSite = s.trucks.filter((t) => t.status !== 'offsite' && t.status !== 'done');
  for (let a = 0; a < onSite.length; a++) {
    for (let b = a + 1; b < onSite.length; b++) {
      const ta = onSite[a];
      const tb = onSite[b];
      if (truckParked(ta) && truckParked(tb)) continue;
      if (Math.hypot(ta.pos.x - tb.pos.x, ta.pos.z - tb.pos.z) > 25) continue;
      const gap = circlesGap(truckCircles(ta.pos.x, ta.pos.z, ta.heading), truckCircles(tb.pos.x, tb.pos.z, tb.heading));
      minTruckGap = Math.min(minTruckGap, gap);
      if (gap < 0) {
        truckFootprintOverlaps++;
        overlapKinds[`${ta.status}/${ta.stage ?? ''}+${tb.status}/${tb.stage ?? ''}`] = (overlapKinds[`${ta.status}/${ta.stage ?? ''}+${tb.status}/${tb.stage ?? ''}`] ?? 0) + 1;
      }
    }
  }

  // Máquinas: tiempo seguido en espera.
  for (const m of s.machines) {
    const w = m.status === 'waiting' ? (waitRun.get(m.id) ?? 0) + 1 : 0;
    waitRun.set(m.id, w);
    maxWaitRun = Math.max(maxWaitRun, w);
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
const perMinute: Record<number, number> = {};
for (const ts of firstSeen.values()) if (ts > startTs + 1) perMinute[Math.floor(ts / 60)] = (perMinute[Math.floor(ts / 60)] ?? 0) + 1;
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
      truckFootprintOverlaps,
      minTruckFootprintGap_m: round(minTruckGap),
      truckOverlapKinds: overlapKinds,
      maxMachineWaitRun_s: maxWaitRun,
      maxAtDockTargetErr_m: round(maxDockErr, 3),
      maxEntriesSameMinute: Math.max(0, ...Object.values(perMinute)),
      approachSec: {
        max: round(Math.max(0, ...approachMin.map((m) => m * 60)), 0),
        avg: round(approachMin.length ? (approachMin.reduce((a, b) => a + b, 0) / approachMin.length) * 60 : 0, 0),
      },
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
