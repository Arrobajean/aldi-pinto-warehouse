import { STORES } from '@/lib/data/stores';
import type { WarehouseLayout } from '@/lib/layout/types';
import { SIM_START_TS } from '@/lib/sim/clock';
import type { InboundArrival, SimDemand, StoreOrder } from '@/lib/sim/types';

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OUTBOUND_MINS = 8.5 * 3600; // ventana de entrega: antes de las 08:30

/** Genera los pedidos del día y la agenda de proveedores. */
export function generateDemand(layout: WarehouseLayout, seed: number): SimDemand {
  const rng = makeRng(seed);
  const outboundDocks = layout.docks.filter((d) => d.kind === 'outbound');

  const orders: StoreOrder[] = [];
  STORES.forEach((store, i) => {
    const dock = outboundDocks[i % outboundDocks.length];
    orders.push({
      id: `ORD-${String(i + 1).padStart(4, '0')}`,
      storeId: store.id,
      storeName: store.name,
      province: store.province,
      paletsCount: store.palletsPerDay,
      temp: store.temperatureCategory === 'Frío' ? 'cool' : store.temperatureCategory === 'Congelado' ? 'frozen' : 'dry',
      dockId: dock.id,
      windowEnd: OUTBOUND_MINS,
    });
  });

  // Agenda de proveedores a lo largo del día (pico de mañana).
  const providers = ['Pastas Gallo', 'Central Lechera', 'Ultracongelados Polo', 'Bebidas del Sur', 'Conservas Mira', 'Mercamadrid Frutas'];
  const inbound: InboundArrival[] = [];
  let n = 0;
  // Pico de llegadas entre 05:00 y 12:00, más tarde más espaciadas.
  for (let ts = SIM_START_TS; ts < 22 * 3600 && n < 42; n++) {
    const peak = ts >= 5 * 3600 && ts <= 12 * 3600;
    ts += (peak ? 7 : 14) * 60 + rng() * 10 * 60;
    const temp = (['dry', 'cool', 'frozen'] as const)[Math.floor(rng() * 3)];
    inbound.push({
      id: `INB-${String(n + 1).padStart(3, '0')}`,
      atTs: Math.floor(ts),
      paletsCount: 16 + Math.floor(rng() * 20),
      temp,
      provider: providers[Math.floor(rng() * providers.length)],
    });
  }

  return { orders, inbound };
}