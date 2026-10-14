/** Alta de camiones y palés: llegadas de proveedores y salidas de expedición escalonadas. (extraído de trucks.ts) */

import { avanzarCabeza, ventanaDeSalida } from '@/lib/sim/outbound-window';
import { KEEP_OUT } from '@/lib/sim/positions';
import type { WarehouseLayout } from '@/lib/layout/types';
import { nextRandom } from '@/lib/sim/rng';
import { waitingStallCount } from '@/lib/sim/truck-stalls';
import type { Pallet, SimState, Truck } from '@/lib/sim/types';
import { SPAWN_HEADING, TRUCK_SPAWN } from '@/lib/sim/yard-routes';
import { skuForTemp } from '@/lib/stock/catalog';

const PLATES = ['E-4821-KLP', 'E-9114-LCM', 'E-2650-PRQ', 'E-7308-JHV', 'E-1185-BNK', 'E-6620-XWZ', 'E-3456-TDQ', 'E-8899-MFA'];

export function newTruck(state: SimState, init: Pick<Truck, 'direction' | 'temp' | 'cargoPaletIds' | 'storeIds'> & Partial<Truck>): Truck {
  const id = `TRK-${String(++state.seq.truck).padStart(3, '0')}`;
  return {
    id,
    plate: PLATES[state.seq.truck % PLATES.length],
    status: 'offsite',
    dockId: null,
    pos: { ...TRUCK_SPAWN },
    path: [],
    route: [],
    speed: 0,
    heading: SPAWN_HEADING,
    v: 0,
    dwell: 0,
    stallId: null,
    nextRoute: [],
    fromDockId: null,
    progress: 0,
    gateAt: state.ts,
    paletsLoaded: 0,
    waitTimer: 0,
    ...init,
  };
}

export function createPalet(state: SimState, temp: Pallet['temp'], destStoreId?: string): Pallet {
  const id = `PL-${String(++state.seq.palet).padStart(5, '0')}`;
  const p: Pallet = {
    id,
    // Artículo de la misma temperatura que el camión: así se ubica en su sala (seco, frío o congelado).
    sku: skuForTemp(temp, (state.seq.palet * 0.6180339887) % 1),
    family: destStoreId ? 'pedido' : 'proveedor',
    temp,
    state: 'received',
    locId: null,
    pos: { ...KEEP_OUT },
    height: 1.2,
    destStoreId,
    receivedDay: 0,
    daysToExpiry: 30 + nextRandom(state) % 90,
    batch: `L${String(24000 + (state.seq.palet % 900)).padStart(5, '0')}`,
    quantity: 40 + (state.seq.palet % 60),
  };
  return p;
}

/** Crea un camión de proveedor con su carga. Llega fuera de la parcela y espera turno en la garita. */
export function spawnInboundTruck(state: SimState, paletsCount: number, temp: 'dry' | 'cool' | 'frozen', provider: string): Truck {
  const cargoPaletIds: string[] = [];
  for (let i = 0; i < paletsCount; i++) {
    const p = createPalet(state, temp);
    p.family = provider;
    state.paletById[p.id] = p;
    state.pallets.push(p);
    cargoPaletIds.push(p.id);
  }
  const t = newTruck(state, { direction: 'inbound', temp, cargoPaletIds, storeIds: [] });
  state.trucks.push(t);
  return t;
}

/**
 * Camiones que esperan muelle (en la cola de la garita, en la garita, en la báscula o en una plaza). Cada uno puede
 * acabar en una plaza de espera: si no hay muelle libre al pesar, el camión se queda en la báscula hasta que haya plaza.
 */
function esperandoMuelle(state: SimState): number {
  let n = 0;
  for (const t of state.trucks) {
    if (t.status === 'offsite' || t.status === 'gate' || t.status === 'scale' || t.status === 'parking') n++;
  }
  return n;
}

/**
 * Tope de entrada: los camiones que esperan muelle no pasan de las plazas de espera del patio. Los atracados y los
 * que salen no cuentan (no ocupan plaza): así el tope no frena a la entrada por los camiones que ya se van.
 */
function hayPlazaDeEspera(state: SimState, layout: WarehouseLayout): boolean {
  return esperandoMuelle(state) < waitingStallCount(layout);
}

export function updateInboundSpawns(state: SimState, layout: WarehouseLayout) {
  const list = state.demand.inbound;
  let spawned = 0;
  for (let i = state.spawnedInbound; i < list.length; i++) {
    const arrival = list[i];
    if (arrival.atTs > state.ts) break;
    if (!hayPlazaDeEspera(state, layout)) break;
    state.spawnedInbound = i + 1;
    spawned++;
    spawnInboundTruck(state, arrival.paletsCount, arrival.temp, arrival.provider);
  }
  return spawned;
}

/** Camiones de salida que puede haber en el patio a la vez: más congestiona la salida por el carril este. */
export const SALIDAS_EN_PATIO_MAX = 12;

export function spawnOutboundIfRoom(state: SimState, layout: WarehouseLayout) {
  // Comparte las plazas de espera con la entrada (si su muelle está ocupado, espera en una).
  if (!hayPlazaDeEspera(state, layout)) return;
  if (state.trucks.filter((t) => t.direction === 'outbound').length >= SALIDAS_EN_PATIO_MAX) return;
  // Salida justo a tiempo: sale el primer pedido de la ventana que ya está preparado en la calle de su muelle, así el
  // camión no espera en el muelle. Un pedido frío o congelado con parte cárnica sale cuando la tarde la termina.
  // Frío y congelado salen por la tarde (la mañana solo saca seco); cada camión sale cuando su pedido está preparado.
  const order = ventanaDeSalida(state).find(
    (o) => (o.temp === 'dry' || state.shiftId !== 'mañana') && (state.lanePallets[o.dockId] ?? []).length >= o.paletsCount,
  );
  if (!order) return;
  state.lanzados[order.id] = true;
  state.trucks.push(
    newTruck(state, { direction: 'outbound', temp: order.temp, cargoPaletIds: [], storeIds: [order.storeId], orderId: order.id }),
  );
  avanzarCabeza(state);
}
