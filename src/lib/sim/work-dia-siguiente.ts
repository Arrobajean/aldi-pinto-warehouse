/**
 * Preparación del día siguiente: los pedidos de mañana se conocen hoy, se preparan por adelantado cuando sobra
 * capacidad y su camión sale el día que le toca. El día operativo empieza a las 06:00 (la noche es del día anterior).
 */
import type { WarehouseLayout } from '@/lib/layout/types';
import { generateDemand } from '@/lib/sim/demand';
import type { SimState, StoreOrder } from '@/lib/sim/types';

const DIA = 24 * 3600;
const INICIO_DIA = 6 * 3600;

/** Día operativo de un instante: 0 desde las 06:00 del primer día hasta las 06:00 del segundo, y así. */
export function diaOperativo(ts: number): number {
  return Math.floor((ts - INICIO_DIA) / DIA);
}

/** Día en que sale un pedido (su ventana de entrega lleva el día: `windowEnd` = hora + día × 24 h). */
export function diaDelPedido(order: StoreOrder): number {
  return Math.floor(order.windowEnd / DIA);
}

/** ¿Es un pedido de un día posterior al de hoy? Se puede preparar, pero su camión aún no sale. */
export function esDeOtroDia(state: SimState, order: StoreOrder): boolean {
  return diaDelPedido(order) > diaOperativo(state.ts);
}

/**
 * Añade los pedidos y las entradas de proveedor del día siguiente si aún no están. Cada día tiene su semilla; los
 * ids llevan el día (`ORD-1-0001`, `INB-1-001`) y las horas se desplazan un día por cada día de diferencia.
 */
export function asegurarDemandaDiaSiguiente(state: SimState, layout: WarehouseLayout): void {
  const siguiente = diaOperativo(state.ts) + 1;
  const ultimo = state.demand.orders.reduce((a, o) => Math.max(a, diaDelPedido(o)), 0);
  for (let dia = ultimo + 1; dia <= siguiente; dia++) {
    const d = generateDemand(layout, state.seed + 7 + dia * 7919);
    for (const o of d.orders) {
      state.demand.orders.push({ ...o, id: o.id.replace('ORD-', `ORD-${dia}-`), windowEnd: o.windowEnd + dia * DIA });
    }
    for (const a of d.inbound) {
      state.demand.inbound.push({ ...a, id: a.id.replace('INB-', `INB-${dia}-`), atTs: a.atTs + dia * DIA });
    }
  }
}
