import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { MAX_ON_FORKS, handlingSeconds, planStops, type Stop } from '../src/lib/sim/handling';
import type { SimTask } from '../src/lib/sim/types';

// Comprobación de las paradas de manipulación (coger/dejar) que planifica `planStops` con tareas reales de la
// simulación: capacidad de las horquillas, valores finitos, alturas de hueco y duración de cada maniobra.
// Simula desde el inicio de turno hasta las 10:00.

const END_TS = 10 * 3600;
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);

const seen = new Set<string>();
const errors: string[] = [];
const perKind: Record<string, { tasks: number; stops: number; seconds: number; maxSeconds: number; maxPerStop: number; noStops: number }> = {};
const depths: Record<string, { min: number; max: number }> = {};
const heights = new Set<number>();

function fail(msg: string) {
  if (errors.length < 20) errors.push(msg);
}

function check(task: SimTask, machineKind: string, stops: Stop[]) {
  const cap = MAX_ON_FORKS[task.machineKind];
  const rec = (perKind[task.kind] ??= { tasks: 0, stops: 0, seconds: 0, maxSeconds: 0, maxPerStop: 0, noStops: 0 });
  rec.tasks++;
  if (stops.length === 0) rec.noStops++;
  let carried = 0;
  let total = 0;
  for (const st of stops) {
    for (const v of [st.x, st.z, st.height, st.face, st.depth, st.place.x, st.place.y, st.place.z, st.place.rotY]) {
      if (!Number.isFinite(v)) fail(`${task.id} (${task.kind}): valor no finito en parada ${st.kind}`);
    }
    if (st.paletIds.length < 1 || st.paletIds.length > cap) fail(`${task.id} (${task.kind}): ${st.paletIds.length} palés en una parada (máx. ${cap})`);
    if (st.where === 'rack') {
      if (st.paletIds.length !== 1) fail(`${task.id}: en rack solo se maneja 1 palé por parada`);
      heights.add(Math.round(st.height * 10) / 10);
    }
    const d = (depths[`${st.where}`] ??= { min: Infinity, max: -Infinity });
    d.min = Math.min(d.min, st.depth);
    d.max = Math.max(d.max, st.depth);
    if (st.kind === 'take') carried += st.paletIds.length;
    else carried -= st.paletIds.length;
    if (carried > cap) fail(`${task.id} (${task.kind}): ${carried} palés en las horquillas (máx. ${cap})`);
    if (carried < 0) fail(`${task.id} (${task.kind}): se deja un palé que no se había cogido`);
    const secs = handlingSeconds(task.machineKind, st, carried - (st.kind === 'take' ? st.paletIds.length : 0) > 0);
    total += secs;
    rec.maxPerStop = Math.max(rec.maxPerStop, secs);
  }
  if (stops.length > 0 && carried !== 0) fail(`${task.id} (${task.kind}): termina con ${carried} palés sin dejar`);
  rec.stops += stops.length;
  rec.seconds += total;
  rec.maxSeconds = Math.max(rec.maxSeconds, total);
  void machineKind;
}

let step = 0;
while (s.ts < END_TS) {
  tick(s, deps, 0.1);
  step++;
  if (step % 10 !== 0) continue;
  for (const m of s.machines) {
    if (!m.taskId || seen.has(m.taskId)) continue;
    seen.add(m.taskId);
    const task = s.tasks.find((t) => t.id === m.taskId);
    if (!task) continue;
    check(task, m.kind, planStops(s, deps, m, task));
  }
}

console.log(`Tareas analizadas: ${seen.size}`);
for (const [kind, r] of Object.entries(perKind)) {
  console.log(
    `${kind.padEnd(10)} tareas ${String(r.tasks).padStart(4)} · paradas ${String(r.stops).padStart(4)} · media ${(r.seconds / r.tasks).toFixed(1)} s por tarea · máx. ${r.maxSeconds.toFixed(1)} s · máx. por parada ${r.maxPerStop.toFixed(1)} s · sin paradas ${r.noStops}`,
  );
}
for (const [where, d] of Object.entries(depths)) console.log(`profundidad ${where}: ${d.min.toFixed(2)} … ${d.max.toFixed(2)} m`);
console.log('cotas de rack vistas:', [...heights].sort().join(', '));
console.log(errors.length === 0 ? 'OK: sin errores' : `ERRORES (${errors.length}):\n  ${errors.join('\n  ')}`);
if (errors.length > 0) process.exitCode = 1;
