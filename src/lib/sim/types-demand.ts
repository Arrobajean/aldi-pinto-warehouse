/** Demanda del día: pedidos de tienda y llegadas programadas de proveedores. (extraído de types.ts) */

/** Pedido diario de una tienda. */
export interface StoreOrder {
  id: string;
  storeId: string;
  storeName: string;
  province: string;
  /** Bultos (cajas) pedidos por la tienda en el día. */
  bultos: number;
  /** Palés a preparar: bultos ÷ bultos por palé de la zona de picking del pedido. */
  paletsCount: number;
  temp: 'dry' | 'cool' | 'frozen';
  dockId: string;
  windowEnd: number;
}

/** Llegada programada de un proveedor. */
export interface InboundArrival {
  id: string;
  atTs: number;
  paletsCount: number;
  temp: 'dry' | 'cool' | 'frozen';
  provider: string;
}

export interface SimDemand {
  orders: StoreOrder[];
  inbound: InboundArrival[];
}
