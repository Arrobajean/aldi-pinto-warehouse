// Fase 0 del plan de picking por voz (PLAN-PICKING-VOZ.md): línea base de la preparación antes del cambio.
// Uso: npx tsx scripts/medir-picking.ts [semilla] [horaFin]
import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';

const layout = buildPintoLayout();
const deps = makeDeps(layout);
const seed = Number(process.argv[2] ?? 20260301);
const endH = Number(process.argv[3] ?? 22);
const s = createInitialState(layout, seed);

const pickTasks = new Map<string, { dockId: string; section: string; palets: number }>();
const replenish = new Set<string>();
let viajesRecogepedidos = 0;
const ocupado = new Map<string, string | null>();

while (s.ts < endH * 3600) {
  tick(s, deps, 0.1);
  for (const t of s.tasks) {
    if (t.kind === 'pick' && !pickTasks.has(t.id)) pickTasks.set(t.id, { dockId: t.dockId ?? '', section: t.section ?? '', palets: t.paletIds.length });
    if (t.kind === 'replenish') replenish.add(t.id);
  }
  // Viaje = cada vez que un recogepedidos toma una tarea nueva.
  for (const m of s.machines) {
    if (m.kind !== 'recogepedidos') continue;
    if (m.taskId && m.taskId !== ocupado.get(m.id)) viajesRecogepedidos++;
    ocupado.set(m.id, m.taskId);
  }
}

const palets = [...pickTasks.values()].reduce((a, t) => a + t.palets, 0);
const porSeccion: Record<string, { lotes: number; palets: number }> = {};
for (const t of pickTasks.values()) {
  const e = (porSeccion[t.section] ??= { lotes: 0, palets: 0 });
  e.lotes++;
  e.palets += t.palets;
}
const expedidos = s.demand.orders.filter((o) => s.outboundDone.includes(o.id));
const fmt = (n: number) => n.toFixed(2);

console.log(`semilla ${seed} · hasta las ${endH}:00`);
console.log(`pedidos: ${s.demand.orders.length} · expedidos: ${expedidos.length} · camiones de salida: ${s.stats.trucksOut}`);
console.log(`bultos pedidos: ${s.demand.orders.reduce((a, o) => a + o.bultos, 0)} · palés pedidos (paletsCount): ${s.demand.orders.reduce((a, o) => a + o.paletsCount, 0)}`);
console.log(`lotes de picking: ${pickTasks.size} · palés de stock retirados enteros: ${palets} · palés por lote: ${fmt(palets / Math.max(1, pickTasks.size))}`);
console.log(`palés preparados: ${s.stats.prepared} · viajes de recogepedidos: ${viajesRecogepedidos} · reposiciones: ${replenish.size}`);
if (expedidos.length > 0) {
  const pal = expedidos.reduce((a, o) => a + o.paletsCount, 0);
  const bul = expedidos.reduce((a, o) => a + o.bultos, 0);
  console.log(`expedidos: ${fmt(pal / expedidos.length)} palés por pedido · ${fmt(bul / pal)} bultos por palé`);
}
console.log('por sección (lotes / palés):');
for (const [section, e] of Object.entries(porSeccion).sort((a, b) => b[1].palets - a[1].palets)) {
  console.log(`  ${section.padEnd(28)} ${String(e.lotes).padStart(5)} / ${e.palets}`);
}
