/** Ventana de salidas: los primeros pedidos que aún no han salido, en el orden de la agenda. */

import type { SimState, StoreOrder } from '@/lib/sim/types';
import { esDeOtroDia } from '@/lib/sim/work-dia-siguiente';
import { bultosPorPaleZona } from '@/lib/stock/catalog';

/** Pedidos de la ventana que se preparan por adelantado y pueden salir (cuántos a la vez). */
export const VENTANA_SALIDA = 12;

/** Índice del primer pedido que aún no ha salido ni tiene camión (mantiene `outOrdersSpawned`). */
export function avanzarCabeza(state: SimState): void {
  while (state.outOrdersSpawned < state.demand.orders.length && state.lanzados[state.demand.orders[state.outOrdersSpawned].id]) {
    state.outOrdersSpawned++;
  }
}

/** ¿Puede salir ya el camión de este pedido? Frío y congelado solo salen por la tarde; el seco sale cuando está listo. */
export function puedeSalirAhora(state: SimState, order: StoreOrder): boolean {
  return order.temp === 'dry' || state.preparacion.turno !== 'mañana';
}

/** ¿Queda presupuesto del turno en la zona del pedido para al menos un palé? */
function hayPresupuesto(state: SimState, order: StoreOrder): boolean {
  return state.preparacion.restante[order.temp] >= bultosPorPaleZona(order.temp);
}

/**
 * ¿Ocupa este pedido la ventana en el turno en curso?
 * - Si su calle ya tiene el pedido entero y su camión puede salir, sí (espera su camión).
 * - Si queda algo que el turno pueda preparar, solo si queda presupuesto en su zona: un pedido que el turno no puede
 *   avanzar no debe quitar sitio a los de otras zonas (los de congelado sin presupuesto dejaban sin ventana al seco).
 * - Si ya está todo preparado, si su camión puede salir ya (un pedido de seco preparado que saliera de la ventana no
 *   se lanzaría nunca).
 * La mañana no prepara cárnicos ni vegetales: un pedido de frío o congelado que solo tiene eso pendiente espera a la
 * tarde y no ocupa la ventana.
 */
export function preparableAhora(state: SimState, order: StoreOrder): boolean {
  if (puedeSalirAhora(state, order) && (state.lanePallets[order.dockId] ?? []).length >= order.paletsCount) return true;
  const rem = state.pickRemaining[order.id];
  const carne = rem && !puedeSalirAhora(state, order) ? state.pickCarne[order.id] ?? {} : {};
  const queda = !rem || Object.entries(rem).some(([seccion, palets]) => palets - (carne[seccion] ?? 0) > 0);
  if (queda) return (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.Q_NOB ? true : hayPresupuesto(state, order); // TEMP-Q
  return puedeSalirAhora(state, order);
}

/**
 * Los primeros `n` pedidos de la agenda que aún no tienen camión, ni han salido, y que el turno puede preparar.
 * Solo los del día en curso (o atrasados): los del día siguiente van al final de la agenda y se preparan por
 * adelantado aparte (ver `pickingPlan`), pero su camión no sale hasta su día.
 */
export function ventanaDeSalida(state: SimState, n = VENTANA_SALIDA, libre: (order: StoreOrder) => boolean = () => true): StoreOrder[] {
  const out: StoreOrder[] = [];
  for (let i = state.outOrdersSpawned; i < state.demand.orders.length && out.length < n; i++) {
    const order = state.demand.orders[i];
    if (esDeOtroDia(state, order)) break;
    if (!state.lanzados[order.id] && preparableAhora(state, order) && libre(order)) out.push(order);
  }
  return out;
}
