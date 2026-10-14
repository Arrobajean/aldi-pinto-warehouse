/** Picking: reparto del pedido de cada camión de salida atracado en lotes por sección y preparación en las flejadoras. (extraído de work.ts) */

import { dockTempCounts, sectionTemp } from '@/lib/sim/consolidation';
import type { SimDeps } from '@/lib/sim/deps';
import { nextTaskId } from '@/lib/sim/events';
import { PICK_LOT_MAX, pickingPlan, splitOrder, takeColdRoute, takeInWalkOrder } from '@/lib/sim/picking';
import { COLD_SECTION, type SectionIndex } from '@/lib/sim/sections';
import { MANUAL_STRAP_SECONDS, freeStrapper, nearestStrapper, strapperById } from '@/lib/sim/strappers';
import type { SimState, StoreOrder, Truck } from '@/lib/sim/types';
import { FAMILIAS_TURNO_TARDE, bultosPorPaleZona } from '@/lib/stock/catalog';

/** Secciones de picking de una clase de temperatura: el pedido de seco no pide frío ni congelado, y así para cada clase. */
function seccionesDeClase(deps: SimDeps, temp: StoreOrder['temp']): SectionIndex['sectionsByTemp'] {
  const out: SectionIndex['sectionsByTemp'] = { dry: [], cool: [], frozen: [] };
  out[temp] = deps.sections.sectionsByTemp[temp];
  return out;
}

/** Palés cárnicos o vegetales que faltan en cada sección: la parte de lo pendiente que solo prepara la tarde. */
function carnePorSeccion(state: SimState, remaining: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [section, left] of Object.entries(remaining)) {
    const palets = state.pickingBySection[section] ?? [];
    const carne = palets.filter((pid) => FAMILIAS_TURNO_TARDE.has(state.paletById[pid]?.family ?? '')).length;
    out[section] = palets.length > 0 ? Math.round((left * carne) / palets.length) : 0;
  }
  return out;
}

/** Picking: reparte el pedido de cada camión de salida atracado y lo manda a preparar por secciones. */
export function generatePicking(state: SimState, deps: SimDeps) {
  // Picking para cada camión de salida atracado, por secciones: el pedido se reparte una vez (al atracar) entre
  // las secciones de seco (familias de pasillo), frío y congelado; cada parte es un lote aparte que prepara un
  // preparador de esa sección, recorriendo sus pasillos en orden. El pedido se prepara en el muelle donde está
  // atracado el camión (puede diferir del muelle previsto).
  const loadingTrucks = new Map<string, Truck>();
  for (const t of state.trucks) {
    if (t.direction === 'outbound' && t.status === 'at_dock' && t.orderId && t.dockId) loadingTrucks.set(t.orderId, t);
  }
  // Palés ya reservados por otra recogida abierta (o por una ruta de frío pendiente) no se vuelven a elegir.
  const reserved = new Set([
    ...state.tasks.filter((t) => t.kind === 'pick' && t.state !== 'done').flatMap((t) => t.paletIds),
    ...Object.values(state.pickRoutes ?? {}).flat(),
  ]);
  for (const { order, dockId, truck } of pickingPlan(state, loadingTrucks)) {
    if (!state.pickRemaining[order.id]) {
      // Lo que ya está en camino (calle, flejado, recogidas) o cargado no se vuelve a pedir.
      const inPipe = Object.values(dockTempCounts(state, dockId)).reduce((a, b) => a + b, 0) + (truck?.cargoPaletIds.length ?? 0);
      state.pickRemaining[order.id] = splitOrder(Math.max(0, order.paletsCount - inPipe), seccionesDeClase(deps, order.temp));
      state.pickCarne[order.id] = carnePorSeccion(state, state.pickRemaining[order.id]);
    }
    const remaining = state.pickRemaining[order.id];
    // Salvaguarda: si ya no queda nada por pedir ni en el circuito del muelle y aun así falta carga, se pide lo que
    // falta (un palé perdido por el camino no puede dejar el camión atracado para siempre).
    if (truck && Object.values(remaining).every((v) => v <= 0) && (state.lanePallets[dockId] ?? []).length === 0) {
      const total = state.dockStates.find((d) => d.dockId === dockId)?.totalPalets ?? order.paletsCount;
      const busy = state.tasks.some((t) => t.dockId === dockId && t.state !== 'done');
      if (!busy && truck.paletsLoaded < total) {
        const inPipe = Object.values(dockTempCounts(state, dockId)).reduce((a, b) => a + b, 0);
        const missing = total - truck.paletsLoaded - inPipe;
        if (missing > 0) {
          Object.assign(remaining, splitOrder(missing, seccionesDeClase(deps, order.temp)));
          state.pickCarne[order.id] = carnePorSeccion(state, remaining);
        }
      }
    }
    // Lo mismo antes de que llegue el camión: la calle es del muelle, no del pedido, así que lo que contó al empezar
    // puede haberse ido con el camión de otro pedido del mismo muelle. Si no queda nada por pedir, el muelle está
    // parado y en su circuito no está el pedido entero, se pide lo que falta (si no, el pedido ocupa la ventana sin
    // salir nunca).
    if (!truck && Object.values(remaining).every((v) => v <= 0) && !state.tasks.some((t) => t.dockId === dockId && t.state !== 'done')) {
      const missing = order.paletsCount - Object.values(dockTempCounts(state, dockId)).reduce((a, b) => a + b, 0);
      if (missing > 0) {
        Object.assign(remaining, splitOrder(missing, seccionesDeClase(deps, order.temp)));
        state.pickCarne[order.id] = carnePorSeccion(state, remaining);
      }
    }
    for (const [section, left] of Object.entries(remaining)) {
      if (left <= 0) continue;
      // Cárnicos y vegetales: solo los prepara la tarde. La mañana solo puede tomar lo que no es de esas familias.
      const carne = state.pickCarne[order.id] ?? {};
      const alcance = state.preparacion.turno === 'mañana' ? Math.max(0, left - (carne[section] ?? 0)) : left;
      if (alcance <= 0) continue;
      // Un lote por sección a la vez: el siguiente, cuando el preparador termina el anterior.
      if (state.tasks.some((t) => t.kind === 'pick' && t.dockId === dockId && t.section === section && t.state !== 'done')) continue;
      // Presupuesto del turno: el lote se acorta a los palés cuyos bultos caben; sin sitio para uno, lo que queda
      // pasa al turno siguiente (antes, un lote de 2 sin presupuesto para 2 bloqueaba el último palé del turno).
      const bultosPorPalet = bultosPorPaleZona(sectionTemp(section));
      const zona = sectionTemp(section);
      const lote = Math.min(alcance, PICK_LOT_MAX, Math.floor(state.preparacion.restante[zona] / bultosPorPalet));
      if (lote <= 0) continue;
      // Frío sigue su ruta de pasillo 1 a 9; el resto de secciones toma un tramo de pasillos (como antes).
      const take = section === COLD_SECTION
        ? takeColdRoute(state, deps, order.id, alcance, reserved, lote)
        : takeInWalkOrder(state, deps, section, lote, reserved);
      if (take.length === 0) continue;
      state.preparacion.restante[zona] -= take.length * bultosPorPalet;
      remaining[section] = left - take.length;
      const carneTomada = take.filter((pid) => FAMILIAS_TURNO_TARDE.has(state.paletById[pid]?.family ?? '')).length;
      carne[section] = Math.max(0, (carne[section] ?? 0) - carneTomada);
      state.pickCarne[order.id] = carne;
      for (const pid of take) reserved.add(pid);
      const firstSlot = state.slotPos[state.paletById[take[0]]?.locId ?? ''];
      const from = firstSlot ? { x: firstSlot.x, z: firstSlot.z } : { x: 0, z: 47 };
      // Entrada de la flejadora con cola libre; si las dos están llenas, el preparador flejará a mano.
      const freeId = freeStrapper(state, deps, from);
      const manual = freeId === null;
      const strapperId = freeId ?? nearestStrapper(deps, from);
      const station = strapperById(deps, strapperId);
      state.tasks.push({
        id: nextTaskId('TSK'),
        kind: 'pick',
        machineKind: 'recogepedidos',
        from,
        to: station ? (manual ? station.output : station.input) : from,
        dockId,
        paletIds: take,
        duration: manual ? 4 + MANUAL_STRAP_SECONDS * take.length : 4,
        strapperId,
        manual,
        section,
        state: 'queued',
      });
    }
  }
  // Pedidos ya expedidos: fuera del reparto.
  const outboundDoneSet = new Set(state.outboundDone);
  for (const orderId of Object.keys(state.pickRemaining)) {
    if (!loadingTrucks.has(orderId) && outboundDoneSet.has(orderId)) {
      delete state.pickRemaining[orderId];
      delete state.pickCarne[orderId];
      if (state.pickRoutes) delete state.pickRoutes[orderId];
    }
  }
}
