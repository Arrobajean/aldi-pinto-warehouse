import { STORES } from '@/lib/data/stores';
import type { WarehouseLayout } from '@/lib/layout/types';
import { SIM_START_TS } from '@/lib/sim/clock';
import type { InboundArrival, SimDemand, StoreOrder } from '@/lib/sim/types';
import { bultosPorPaleZona } from '@/lib/stock/catalog';

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
/** Cada tienda tiene su ritmo de pedido, con esta variación (± fracción) sobre su peso. */
const VARIACION_TIENDA = 0.2;
/** Volumen de cada turno (bultos), según el día. */
const VOLUMEN_TURNO_MIN = 30000;
const VOLUMEN_TURNO_MAX = 70000;
/** Por debajo de esta cantidad una clase no genera pedido (la tienda no pide esa clase ese día). */
const BULTOS_MINIMOS_PEDIDO = 200;
const ZONAS = ['dry', 'cool', 'frozen'] as const;

/**
 * Genera los pedidos del día y la agenda de proveedores.
 * Cada tienda pide las tres clases (seco, frío y congelado); la cantidad de cada una es aleatoria y cambia cada día.
 * Cada clase sale por un camión de su tipo, desde un muelle de su misma temperatura.
 */
export function generateDemand(layout: WarehouseLayout, seed: number): SimDemand {
  const rng = makeRng(seed);
  const outboundDocks = layout.docks.filter((d) => d.kind !== 'inbound');
  const docksByTemp: Record<StoreOrder['temp'], typeof outboundDocks> = { dry: [], cool: [], frozen: [] };
  // Frío y congelado comparten los muelles de temperatura negativa (47–60); el seco tiene los suyos.
  const muellesFrio = outboundDocks.filter((d) => d.temp === 'frozen');
  docksByTemp.dry = outboundDocks.filter((d) => d.temp === 'dry');
  docksByTemp.cool = muellesFrio;
  docksByTemp.frozen = muellesFrio;
  const nextDock: Record<StoreOrder['temp'], number> = { dry: 0, cool: 0, frozen: 0 };

  // Volumen del día: la suma de los dos turnos, cada uno entre 33.000 y 60.000 bultos.
  const volumenDia =
    VOLUMEN_TURNO_MIN + rng() * (VOLUMEN_TURNO_MAX - VOLUMEN_TURNO_MIN) +
    (VOLUMEN_TURNO_MIN + rng() * (VOLUMEN_TURNO_MAX - VOLUMEN_TURNO_MIN));
  // Peso de cada tienda en el reparto del día: su palé de referencia con la variación propia.
  const pesos = STORES.map((store) => store.palletsPerDay * (1 + (rng() * 2 - 1) * VARIACION_TIENDA));
  const sumaPesos = pesos.reduce((a, p) => a + p, 0);
  // Reparto al azar de cada tienda entre seco, frío y congelado.
  const clases = STORES.map(() => {
    const raw = ZONAS.map(() => 0.3 + rng());
    const suma = raw.reduce((a, r) => a + r, 0);
    return raw.map((r) => r / suma);
  });

  const orders: StoreOrder[] = [];
  STORES.forEach((store, i) => {
    ZONAS.forEach((temp, c) => {
      const bultos = Math.round((volumenDia * pesos[i]) / sumaPesos * clases[i][c]);
      if (bultos < BULTOS_MINIMOS_PEDIDO) return;
      const docks = docksByTemp[temp];
      const dock = docks[nextDock[temp]++ % docks.length];
      orders.push({
        id: `ORD-${String(orders.length + 1).padStart(4, '0')}`,
        storeId: store.id,
        storeName: store.name,
        province: store.province,
        bultos,
        paletsCount: Math.max(1, Math.round(bultos / bultosPorPaleZona(temp))),
        temp,
        dockId: dock.id,
        windowEnd: OUTBOUND_MINS,
      });
    });
  });

  // Entradas de proveedor: cada clase recibe lo que sale de esa clase ese día, porque la mercancía tiene que estar
  // almacenada antes de prepararse. Camiones de hasta 30 palés, repartidos en la ventana de entrada de su clase: el
  // seco hasta las 10:00 y el frío y congelado hasta las 12:00, para que la tarde tenga la parte fría almacenada.
  const providers = ['Pastas Gallo', 'Central Lechera', 'Ultracongelados Polo', 'Bebidas del Sur', 'Conservas Mira', 'Mercamadrid Frutas'];
  const PALETS_POR_CAMION_ENTRADA = 30;
  const FIN_ENTRADA_H: Record<StoreOrder['temp'], number> = { dry: 10, cool: 12, frozen: 12 };
  const inbound: InboundArrival[] = [];
  for (const temp of ZONAS) {
    let restantes = orders.filter((o) => o.temp === temp).reduce((a, o) => a + o.paletsCount, 0);
    const camiones = Math.ceil(restantes / PALETS_POR_CAMION_ENTRADA);
    const paso = (FIN_ENTRADA_H[temp] * 3600 - SIM_START_TS) / Math.max(1, camiones);
    for (let k = 0; k < camiones; k++) {
      const ts = SIM_START_TS + (k + 0.5) * paso + (rng() - 0.5) * paso * 0.5;
      const palets = Math.min(PALETS_POR_CAMION_ENTRADA, restantes);
      restantes -= palets;
      inbound.push({ id: '', atTs: Math.floor(ts), paletsCount: palets, temp, provider: providers[Math.floor(rng() * providers.length)] });
    }
  }
  inbound.sort((a, b) => a.atTs - b.atTs);
  inbound.forEach((a, i) => {
    a.id = `INB-${String(i + 1).padStart(3, '0')}`;
  });

  return { orders, inbound };
}
