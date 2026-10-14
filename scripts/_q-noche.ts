// Sonda temporal: ¿qué pasa con la preparación al entrar en el turno de noche? (borrar al terminar)
import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
import { bultosPorPaleZona } from '../src/lib/stock/catalog';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
// Arranque adelantado: se salta al final de la tarde para medir solo el paso a la noche.
s.ts = 22 * 3600 - 60;
s.shiftId = 'tarde';
s.preparacion = { turno: 'tarde', restante: { dry: 0, cool: 0, frozen: 0 } };
s.lastShiftChange = s.ts;
const seen = new Map<string, number>();
for (let i = 0; i < 20 * 60 * 10; i++) {
  tick(s, deps, 0.1);
  for (const t of s.tasks) if (t.kind === 'pick' && !seen.has(t.id)) seen.set(t.id, s.ts);
}
const picks = s.tasks.filter((t) => t.kind === 'pick');
const bultos = picks.reduce((a, t) => a + t.paletIds.length * bultosPorPaleZona(s.paletById[t.paletIds[0]].temp), 0);
console.log('turno', s.preparacion.turno, 'lotes de noche creados', seen.size, 'bultos', bultos, 'estados', JSON.stringify(picks.reduce((a: Record<string, number>, t) => ((a[t.state] = (a[t.state] ?? 0) + 1), a), {})), 'restante', JSON.stringify(s.preparacion.restante));
console.log('recogepedidos con tarea', s.machines.filter((m) => m.kind === 'recogepedidos' && m.taskId).length);
