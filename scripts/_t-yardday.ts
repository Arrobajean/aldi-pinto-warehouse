// Diagnóstico temporal del patio (día completo). Uso: tsx scripts/_t-yardday.ts [horaFin=22] [semilla=20260301]
import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { truckFreeDistance, truckCircles, circlesGap, truckParked } from '../src/lib/sim/traffic';
import { ventanaDeSalida } from '../src/lib/sim/outbound-window';
import * as spawnMod from '../src/lib/sim/truck-spawn';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const until = Number(process.argv[2] ?? 22) * 3600;
const seed = Number(process.argv[3] ?? 20260301);
const s = createInitialState(layout, seed);
const dockById = new Map(layout.docks.map((d) => [d.id, d]));
const snaps = new Set([7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22].map((h) => h * 3600));
const prev = new Map<string, string>();
const ev = { dockIn: 0, dockOut: 0, crossTemp: 0, crossTempCoolAtFrozen: 0, crossTempFrozenAtCool: 0, outWrongDock: 0, inAtFrozenCold: 0 };
const crossTempDetail: string[] = [];
let hitCap36 = 0, capWith0Docked = 0, outMax = 0, outCapBinding = 0, overlapMin = 0, waitMax = 0;
const OUT_CAP = (spawnMod as any).SALIDAS_EN_PATIO_MAX ?? 12;
const t0 = performance.now();
const orderById = new Map(s.demand.orders.map((o) => [o.id, o]));
console.log('pedidos', s.demand.orders.length, 'entradas', s.demand.inbound.length, 'seed', seed);
let nextSnap = [...snaps].sort((a, b) => a - b);
let lastCapCheck = 0;
while (s.ts < until) {
  tick(s, deps, 0.1);
  for (const t of s.trucks) {
    const p = prev.get(t.id);
    if (p !== t.status) {
      prev.set(t.id, t.status);
      if (t.status === 'at_dock' && t.dockId) {
        const d = dockById.get(t.dockId)!;
        if (t.direction === 'inbound') {
          ev.dockIn++;
          if (d.temp !== 'dry' && d.index >= 50) ev.inAtFrozenCold++;
          if (d.temp !== t.temp) {
            ev.crossTemp++;
            if (t.temp === 'cool') ev.crossTempCoolAtFrozen++;
            else ev.crossTempFrozenAtCool++;
          }
        } else {
          ev.dockOut++;
          const o = t.orderId ? orderById.get(t.orderId) : undefined;
          if (o && o.dockId !== t.dockId) { ev.outWrongDock++; crossTempDetail.push(`${t.id} ${o.id} ${o.temp} pedido@${o.dockId} atraca@${t.dockId}`); }
          if (d.temp !== t.temp) ev.crossTemp++;
        }
      }
    }
  }
  if (s.ts - lastCapCheck >= 60) {
    lastCapCheck = s.ts;
    const outN = s.trucks.filter((t) => t.direction === 'outbound').length;
    outMax = Math.max(outMax, outN);
    const ready = ventanaDeSalida(s).some((o) => (o.temp === 'dry' || s.shiftId !== 'mañana') && (s.lanePallets[o.dockId] ?? []).length >= o.paletsCount);
    if (ready && outN >= OUT_CAP) outCapBinding++;
    const mv = s.trucks.filter((t) => !truckParked(t));
    let ov = false;
    for (let i = 0; i < mv.length && !ov; i++) for (let j = i + 1; j < mv.length; j++) {
      if (Math.abs(mv[i].pos.x - mv[j].pos.x) > 25 || Math.abs(mv[i].pos.z - mv[j].pos.z) > 25) continue;
      if (circlesGap(truckCircles(mv[i].pos.x, mv[i].pos.z, mv[i].heading), truckCircles(mv[j].pos.x, mv[j].pos.z, mv[j].heading)) < 0) { ov = true; break; }
    }
    if (ov) overlapMin++;
    if (s.trucks.length >= 36) { hitCap36++; if (!s.trucks.some((t) => t.status === 'at_dock')) capWith0Docked++; }
  }
  if (nextSnap.length && s.ts >= nextSnap[0]) {
    const h = nextSnap.shift()! / 3600;
    const by: Record<string, number> = {};
    for (const t of s.trucks) by[`${t.direction === 'inbound' ? 'E' : 'S'}:${t.status}`] = (by[`${t.direction === 'inbound' ? 'E' : 'S'}:${t.status}`] ?? 0) + 1;
    const frozenDocks = layout.docks.filter((d) => d.index >= 50);
    const occ = frozenDocks.map((d) => {
      const tr = s.trucks.find((t) => t.dockId === d.id);
      return tr ? `${d.id}:${tr.direction === 'inbound' ? 'E' : 'S'}${tr.status === 'at_dock' ? '' : '~'}` : null;
    }).filter(Boolean);
    const eastLane = s.trucks.filter((t) => t.status === 'leaving' && t.pos.x > 170 && t.pos.x < 190 && t.pos.z > 0 && t.pos.z < 175);
    const leavingStuck = s.trucks.filter((t) => t.status === 'leaving' && t.v < 0.1);
    const outPending = s.demand.orders.length - s.outOrdersSpawned;
    console.log(`--- ${h}:00  patio=${s.trucks.length} enMuelle=${s.trucks.filter((t) => t.status === 'at_dock').length} offsite=${s.trucks.filter((t) => t.status === 'offsite').length}`);
    console.log('   estados', JSON.stringify(by));
    console.log('   muelles D51-D64', occ.join(' ') || '(libres)');
    console.log('   carril este (x170-190, saliendo)', eastLane.length, ' saliendo parados', leavingStuck.length);
    console.log('   entradas lanzadas', s.spawnedInbound, '/', s.demand.inbound.length, ' pedidos con camión', Object.keys(s.lanzados).length, ' cabeza', s.outOrdersSpawned, 'pendientes', outPending);
    console.log('   stats', JSON.stringify(s.stats), ' ms', (performance.now() - t0).toFixed(0));
    if (process.env.DETAIL && (process.env.DETAIL.split(',').map(Number)).includes(h)) {
      for (const t of s.trucks) {
        if (t.status === 'offsite') continue;
        const why = { reason: '' };
        const rev = t.stage === 'reverse' || t.stage === 'unpark';
        const d = t.status === 'at_dock' ? '-' : truckFreeDistance(s, t, rev, 1.5, false, undefined, why);
        console.log(`     ${t.id} ${t.direction} ${t.temp} ${t.status}/${t.stage} dock=${t.dockId ?? t.fromDockId} stall=${t.stallId} pos=${t.pos.x.toFixed(1)},${t.pos.z.toFixed(1)} v=${t.v.toFixed(2)} wait=${t.waitTimer.toFixed(0)} route=${t.route.length}/${t.nextRoute.length} free=${d} ${why.reason}`);
      }
      console.log('     claims', s.zoneClaims.map((c) => `${c.id}:${c.owner}`).join(' '));
    }
  }
}
console.log('eventos', JSON.stringify(ev), 'minutosTope36', hitCap36, 'tope36con0enMuelle', capWith0Docked, 'maxSalidasEnPatio', outMax, 'minutosTopeSalidaLimita', outCapBinding, 'topeSalida', OUT_CAP, 'minutosConSolape', overlapMin);
console.log(crossTempDetail.slice(0, 15).join('\n'));
