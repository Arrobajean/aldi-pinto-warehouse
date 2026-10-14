/** Siembra del patio y de la nave al inicio del turno: camiones en plazas, muelles, expedición y flejadoras. (extraído de trucks.ts) */

import { dockApproach } from '@/lib/layout/dock-geometry';
import type { Dock, WarehouseLayout } from '@/lib/layout/types';
import { emitEvent } from '@/lib/sim/events';
import { avanzarCabeza } from '@/lib/sim/outbound-window';
import { dockInteriorPoint, stagingPoint } from '@/lib/sim/positions';
import { nextRandom } from '@/lib/sim/rng';
import { dockTruck } from '@/lib/sim/truck-dock';
import { createPalet, newTruck, spawnInboundTruck } from '@/lib/sim/truck-spawn';
import { STALL_EXIT_GAP, freeStall, stallByKey } from '@/lib/sim/truck-stalls';
import type { Pallet, SimState, Truck } from '@/lib/sim/types';
import { stallPoint } from '@/lib/sim/yard-routes';

/**
 * Patio y nave sembrados al inicio del turno:
 * 1. Cinco camiones de proveedor en plazas de espera (salen cada 90 s).
 * 2. Dos camiones de proveedor descargando en muelles de recepción (D07, D12), con mercancía
 *    aún en el semirremolque y palés ya descargados en la playa de recepción (stagingQueue) en espera de putaway.
 * 3. Camiones de expedición atracados cargando pedidos para tiendas (seco D22, frío D42, congelado D52),
 *    con palés ya dentro del semirremolque y palés preparados en las calles de pre-carga (lanePallets).
 * 4. Calles de pre-carga adicionales con palés preparados listos para ser cargados en camiones.
 */
export function seedYard(state: SimState, layout: WarehouseLayout) {
  // 1. Camiones de proveedores esperando en plazas de aparcamiento
  const providers = ['Pastas Gallo', 'Central Lechera', 'Ultracongelados Polo', 'Bebidas del Sur', 'Conservas Mira'];
  const waitingTemps: Truck['temp'][] = ['dry', 'cool', 'dry', 'frozen', 'dry'];
  waitingTemps.forEach((temp, i) => {
    const t = spawnInboundTruck(state, 16 + Math.floor(nextRandom(state) * 20), temp, providers[i]);
    const key = freeStall(state, layout);
    const stall = stallByKey(layout, key);
    if (!key || !stall) return;
    state.stallOccupancy[key] = t.id;
    t.stallId = key;
    t.status = 'parking';
    t.pos = stallPoint(stall);
    t.heading = Math.PI;
    t.gateAt = state.ts;
    emitEvent(state, 'truck_arrived', `Camión ${t.plate} (proveedor ${providers[i]}) espera muelle en ${key}`);
  });
  state.lastStallExitAt = state.ts - STALL_EXIT_GAP + 30;

  // 2. Recepción (Inbound): dos camiones atracados en descarga activa con palés en semirremolque y en playa
  const dryInbound = layout.docks.filter((d) => d.kind === 'inbound' && d.temp === 'dry');
  const inboundSeeds = [
    { dock: dryInbound[2], totalPalets: 24, unloadedCount: 8, provider: 'Bebidas del Sur' },
    { dock: dryInbound[7], totalPalets: 22, unloadedCount: 6, provider: 'Conservas Mira' },
  ];
  for (const item of inboundSeeds) {
    if (!item.dock) continue;
    const t = spawnInboundTruck(state, item.totalPalets, 'dry', item.provider);
    const a = dockApproach(item.dock);
    t.pos = { ...a.target };
    t.heading = a.alignHeading;
    t.gateAt = state.ts;
    dockTruck(state, t, item.dock);

    // Mover palés ya descargados a la playa de recepción (stagingQueue) frente al muelle
    const unloadedIds = t.cargoPaletIds.splice(t.cargoPaletIds.length - item.unloadedCount, item.unloadedCount);
    for (const pid of unloadedIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      p.state = 'staging';
      p.dockId = item.dock.id;
      p.pos = stagingPoint(item.dock);
      state.stagingQueue.push(pid);
    }
    const ds = state.dockStates.find((d) => d.dockId === item.dock.id);
    if (ds) {
      ds.totalPalets = item.totalPalets;
      ds.paletsProcessed = item.unloadedCount;
    }
    state.stats.received += item.unloadedCount;
  }

  // 3. Expedición (Outbound): camiones atracados cargando pedidos para tiendas (Seco, Frío y Congelado)
  const outboundDocks = layout.docks.filter((d) => d.kind !== 'inbound');
  const dockSeco = outboundDocks.find((d) => d.id === 'D22');
  const dockFrio = outboundDocks.find((d) => d.id === 'D42');
  const dockCongelado = outboundDocks.find((d) => d.id === 'D52');

  const outboundSeeds: { dock?: Dock; temp: Pallet['temp']; orderIndex: number; loadedCount: number; stagedCount: number }[] = [
    { dock: dockSeco, temp: 'dry', orderIndex: 0, loadedCount: 6, stagedCount: 12 },
    { dock: dockFrio, temp: 'cool', orderIndex: 1, loadedCount: 4, stagedCount: 10 },
    { dock: dockCongelado, temp: 'frozen', orderIndex: 2, loadedCount: 4, stagedCount: 8 },
  ];

  for (const item of outboundSeeds) {
    const dock = item.dock;
    if (!dock) continue;
    const order = state.demand.orders[item.orderIndex] ?? state.demand.orders[0];
    if (!order) continue;
    order.dockId = dock.id;

    // Crear palés ya preparados para la tienda de este pedido
    const preparedPaletIds: string[] = [];
    const totalPrepared = item.loadedCount + item.stagedCount;
    for (let i = 0; i < totalPrepared; i++) {
      const p = createPalet(state, item.temp, order.storeId);
      p.state = 'prepared';
      p.dockId = dock.id;
      p.pos = stagingPoint(dock);
      p.family = 'pedido';
      state.paletById[p.id] = p;
      state.pallets.push(p);
      preparedPaletIds.push(p.id);
    }
    state.stats.prepared += totalPrepared;

    // Palés ya cargados en el camión y palés en espera en la calle de pre-carga
    const loadedIds = preparedPaletIds.slice(0, item.loadedCount);
    const stagedIds = preparedPaletIds.slice(item.loadedCount);

    state.lanePallets[dock.id] = stagedIds;

    const t = newTruck(state, {
      direction: 'outbound',
      temp: item.temp,
      cargoPaletIds: [],
      storeIds: [order.storeId],
      orderId: order.id,
      paletsLoaded: item.loadedCount,
    });
    for (const pid of loadedIds) {
      const p = state.paletById[pid];
      if (!p) continue;
      p.state = 'loaded';
      p.dockId = dock.id;
      p.pos = dockInteriorPoint(dock);
      p.truckId = t.id;
      t.cargoPaletIds.push(pid);
    }
    state.trucks.push(t);

    const a = dockApproach(dock);
    t.pos = { ...a.target };
    t.heading = a.alignHeading;
    t.gateAt = state.ts;
    dockTruck(state, t, dock);

    const ds = state.dockStates.find((d) => d.dockId === dock.id);
    if (ds) {
      ds.totalPalets = order.paletsCount;
      ds.paletsProcessed = item.loadedCount;
    }
  }
  for (const o of state.demand.orders.slice(0, outboundSeeds.length)) state.lanzados[o.id] = true;
  avanzarCabeza(state);

  // 4. Calles de pre-carga adicionales con palés preparados listos para ser cargados en camiones
  const additionalStagingDocks: { dockId: string; temp: Pallet['temp']; count: number; storeId: string }[] = [
    { dockId: 'D20', temp: 'dry', count: 12, storeId: 'M-02' },
    { dockId: 'D26', temp: 'dry', count: 14, storeId: 'M-05' },
    { dockId: 'D30', temp: 'dry', count: 10, storeId: 'M-07' },
    { dockId: 'D34', temp: 'dry', count: 12, storeId: 'M-09' },
    { dockId: 'D46', temp: 'cool', count: 10, storeId: 'M-06' },
    { dockId: 'D56', temp: 'frozen', count: 10, storeId: 'M-04' },
  ];

  const outboundDockMap = new Map(outboundDocks.map((d) => [d.id, d]));
  for (const item of additionalStagingDocks) {
    const dock = outboundDockMap.get(item.dockId);
    if (!dock) continue;
    const ids: string[] = [];
    for (let i = 0; i < item.count; i++) {
      const p = createPalet(state, item.temp, item.storeId);
      p.state = 'prepared';
      p.dockId = dock.id;
      p.pos = stagingPoint(dock);
      p.family = 'pedido';
      state.paletById[p.id] = p;
      state.pallets.push(p);
      ids.push(p.id);
    }
    state.lanePallets[dock.id] = ids;
    state.stats.prepared += item.count;
  }

  // 5. Trenes de flejado (FLJ-01 y FLJ-02): los productos entran con pallets y salen con pallets
  const strapperStationMap = new Map(layout.strappers.map((s) => [s.id, s]));
  for (const st of state.strappers) {
    const isDry = st.id === 'FLJ-01';
    const temp: Pallet['temp'] = isDry ? 'dry' : 'cool';
    const dockId = isDry ? 'D20' : 'D46';
    const storeId = isDry ? 'M-02' : 'M-06';
    const station = strapperStationMap.get(st.id);

    // Palés en cola de entrada (entrando por la vía de rodillos a la flejadora)
    const qIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const p = createPalet(state, temp, storeId);
      p.state = 'prepared';
      p.dockId = dockId;
      p.pos = { ...(station?.input ?? { x: 0, z: 60 }) };
      p.family = 'pedido';
      state.paletById[p.id] = p;
      state.pallets.push(p);
      qIds.push(p.id);
    }
    st.queue.push({ dockId, paletIds: qIds });

    // Palé en proceso (en el centro del tren, bajo el pórtico de flejado)
    const curP = createPalet(state, temp, storeId);
    curP.state = 'prepared';
    curP.dockId = dockId;
    curP.pos = { ...(station?.input ?? { x: 0, z: 60 }) };
    curP.family = 'pedido';
    state.paletById[curP.id] = curP;
    state.pallets.push(curP);
    st.current = { dockId, paletIds: [curP.id], doneAt: state.ts + (isDry ? 25 : 30) };

    // Palés a la salida (ya flejados, saliendo por la vía de rodillos de salida listos para la transpaleta ESE)
    const outIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const p = createPalet(state, temp, storeId);
      p.state = 'prepared';
      p.dockId = dockId;
      p.pos = { ...(station?.output ?? { x: 0, z: 60 }) };
      p.family = 'pedido';
      state.paletById[p.id] = p;
      state.pallets.push(p);
      outIds.push(p.id);
    }
    state.strapOut.push({ dockId, paletIds: outIds, strapperId: st.id });
    state.stats.prepared += 5;
  }
}
