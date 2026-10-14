// Sonda temporal de preparación (borrar al terminar). Uso: _q-prep.ts <semilla> <hora fin> [roster 0|1]
import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { ventanaDeSalida } from '../src/lib/sim/outbound-window';
import { PREP_AHEAD, PREP_STAGE_MAX } from '../src/lib/sim/picking';
import { createRosterMachines, presentesPorZona } from '../src/lib/sim/work-roster';
import { diaDelPedido, diaOperativo } from '../src/lib/sim/work-dia-siguiente';
import { bultosPorPaleZona } from '../src/lib/stock/catalog';

const layout = buildPintoLayout();
const deps = makeDeps(layout);
const seed = Number(process.argv[2] ?? 20260301);
const endH = Number(process.argv[3] ?? 22);
const s = createInitialState(layout, seed);
// Mientras init.ts no llame a createRosterMachines, la sonda la llama justo después (antes del primer paso).
if (process.argv[4] !== '0' && !s.machines.some((m) => m.id === 'P-13')) createRosterMachines(s, layout);

const bpp = { dry: bultosPorPaleZona('dry'), cool: bultosPorPaleZona('cool'), frozen: bultosPorPaleZona('frozen') } as Record<string, number>;
console.log('seed', seed, 'recogepedidos', s.machines.filter((m) => m.kind === 'recogepedidos').length, 'presentes', JSON.stringify(presentesPorZona(s, deps.sections)));

// Bultos de lotes creados por día operativo, turno y zona; y de cada lote, si es de un pedido de otro día.
const prep: Record<string, Record<string, number>> = {};
const seen = new Set<string>();
const dockOrderDay = (dockId: string) => {
  const o = s.demand.orders.find((x) => x.dockId === dockId && s.pickRemaining[x.id] && !s.outboundDone.includes(x.id));
  return o ? diaDelPedido(o) : -1;
};
let ticksGe = 0;
let ticksBind = 0;
let stagedMax = 0;
let nocheLotes = 0;
let nextH = 7;
while (s.ts < endH * 3600) {
  tick(s, deps, 0.1);
  for (const t of s.tasks) {
    if (t.kind !== 'pick' || seen.has(t.id)) continue;
    seen.add(t.id);
    const zona = s.paletById[t.paletIds[0]]?.temp ?? '?';
    const dOrden = dockOrderDay(t.dockId ?? '');
    const key = `d${diaOperativo(s.ts)}-${s.preparacion.turno}${dOrden > diaOperativo(s.ts) ? '-adelanto' : ''}`;
    prep[key] ??= {};
    prep[key][zona] = (prep[key][zona] ?? 0) + t.paletIds.length * bpp[zona];
    if (s.preparacion.turno === 'noche') nocheLotes++;
  }
  const staged = Object.values(s.lanePallets).reduce((a, l) => a + l.length, 0);
  stagedMax = Math.max(stagedMax, staged);
  if (staged >= PREP_STAGE_MAX) {
    ticksGe++;
    const v = ventanaDeSalida(s, PREP_AHEAD);
    if (v.slice(1).some((o) => !s.pickRemaining[o.id])) ticksBind++;
  }
  if (s.ts >= nextH * 3600) {
    const pickers = s.machines.filter((m) => m.kind === 'recogepedidos');
    const out = s.trucks.filter((t) => t.direction === 'outbound');
    console.log(
      `${nextH}:00 d${diaOperativo(s.ts)} ${s.preparacion.turno} salidas=${s.stats.trucksOut} lanzados=${Object.keys(s.lanzados).length} pedidos=${s.demand.orders.length} prepared=${s.stats.prepared} staged=${staged} restante=${JSON.stringify(s.preparacion.restante)} pick q=${s.tasks.filter((t) => t.kind === 'pick' && t.state === 'queued').length} pickersOcupados=${pickers.filter((m) => m.taskId).length}/${pickers.filter((m) => m.sections?.length).length} outTrucks=${out.length} trucks=${s.trucks.length}`,
    );
    if (process.env.DUMP?.split(',').includes(String(nextH))) {
      for (const o of ventanaDeSalida(s, PREP_AHEAD)) {
        const rem = s.pickRemaining[o.id];
        const carne = s.pickCarne[o.id];
        console.log(`    ${o.id} ${o.temp} ${o.dockId} pal=${o.paletsCount} lane=${(s.lanePallets[o.dockId] ?? []).length} rem=${rem ? Object.values(rem).reduce((a, b) => a + b, 0) : '-'} carne=${carne ? Object.values(carne).reduce((a, b) => a + b, 0) : '-'} lotes=${s.tasks.filter((t) => t.kind === 'pick' && t.dockId === o.dockId).length}`);
      }
    }
    nextH++;
  }
}
const tot: Record<string, number> = {};
for (const o of s.demand.orders) tot[`d${diaDelPedido(o)}-${o.temp}`] = (tot[`d${diaDelPedido(o)}-${o.temp}`] ?? 0) + o.bultos;
console.log('pedido (bultos):', JSON.stringify(tot));
console.log('preparado (bultos al crear el lote):', JSON.stringify(prep));
console.log('staged max', stagedMax, 'ticks staged>=MAX', ticksGe, 'ticks con el tope frenando la ventana', ticksBind, 'lotes creados de noche', nocheLotes);
console.log('final', JSON.stringify(s.stats), 'restante', JSON.stringify(s.preparacion.restante));
