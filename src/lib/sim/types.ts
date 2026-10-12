import type { ZoneId } from '@/lib/types';
import type { Graph } from '@/lib/layout/types';

export interface Point {
  x: number;
  z: number;
}

export type MachineKind = 'retractil' | 'frontal' | 'recogepedidos';
export type MachineStatus = 'idle' | 'traveling' | 'working' | 'waiting' | 'charging';

export type TaskKind = 'putaway' | 'replenish' | 'pick' | 'dock_shift' | 'charge';

export interface SimTask {
  id: string;
  kind: TaskKind;
  machineKind: MachineKind;
  from: Point;
  to: Point;
  /** Ubicación de origen (reserva/picking). */
  fromLocId?: string;
  /** Ubicación de destino (reserva/picking). */
  toLocId?: string;
  paletIds: string[];
  /** Segundos de simulación de trabajo una vez en destino. */
  duration: number;
  /** Muelles involucrados (p. ej. el de la calle de pre-carga). */
  dockId?: string;
  state: 'queued' | 'assigned' | 'transit' | 'working' | 'done';
  machineId?: string;
}

export type TruckStatus = 'offsite' | 'gate' | 'scale' | 'parking' | 'approaching' | 'at_dock' | 'leaving' | 'done';
export type TruckDirection = 'inbound' | 'outbound';

export interface Truck {
  id: string;
  plate: string;
  direction: TruckDirection;
  status: TruckStatus;
  dockId: string | null;
  pos: Point;
  /** Nodos restantes del yard graph. */
  path: string[];
  /** Puntos de ruta en metros. */
  route: Point[];
  speed: number;
  /** 0..1 de avance de descarga/carga en el muelle. */
  progress: number;
  cargoPaletIds: string[];
  storeIds: string[];
  temp: 'dry' | 'cool' | 'frozen';
  /** timestamp de simulación de llegada a la garita. */
  gateAt: number;
  orderId?: string;
  paletsLoaded: number;
  waitTimer: number;
}

export type PalletState = 'received' | 'staging' | 'stored' | 'picking' | 'prepared' | 'loaded' | 'shipped';

export interface Pallet {
  id: string;
  sku: string;
  family: string;
  /** Categoría térmica a la que debe ir. */
  temp: 'dry' | 'cool' | 'frozen';
  state: PalletState;
  locId: string | null;
  pos: Point;
  height: number;
  machineId?: string;
  truckId?: string;
  destStoreId?: string;
  dockId?: string;
}

export interface DockState {
  dockId: string;
  truckId: string | null;
  state: 'free' | 'arriving' | 'loading' | 'unloading';
  paletsProcessed: number;
  totalPalets: number;
}

export type SimEventType =
  | 'truck_arrived'
  | 'truck_weighted'
  | 'truck_docked'
  | 'truck_unloading'
  | 'truck_loading'
  | 'truck_left'
  | 'pallet_received'
  | 'pallet_stored'
  | 'pallet_picked'
  | 'pallet_prepared'
  | 'pallet_shipped'
  | 'machine_low_battery'
  | 'machine_waiting'
  | 'shift_change';

export interface SimEvent {
  ts: number;
  type: SimEventType;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ShiftPeriod {
  id: 'noche' | 'mañana' | 'tarde';
  startHour: number;
  endHour: number;
  /** Máquinas activas simultáneas objetivo. */
  machines: number;
}

export const SHIFTS: ShiftPeriod[] = [
  { id: 'noche', startHour: 22, endHour: 6, machines: 16 },
  { id: 'mañana', startHour: 6, endHour: 14, machines: 26 },
  { id: 'tarde', startHour: 14, endHour: 22, machines: 20 },
];

export function shiftAt(ts: number): ShiftPeriod {
  const hour = (Math.floor(ts / 3600) + 24) % 24;
  for (const s of SHIFTS) {
    if (s.id === 'noche') {
      if (hour >= s.startHour || hour < 6) return s;
    } else if (hour >= s.startHour && hour < s.endHour) {
      return s;
    }
  }
  return SHIFTS[0];
}

/** Pedido diario de una tienda. */
export interface StoreOrder {
  id: string;
  storeId: string;
  storeName: string;
  province: string;
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

export interface SimState {
  ts: number;
  running: boolean;
  speed: number;
  startTs: number;
  seed: number;
  rngState: number;
  shiftId: 'noche' | 'mañana' | 'tarde';
  lastShiftChange: number;

  machines: Machine[];
  trucks: Truck[];
  pallets: Pallet[];
  tasks: SimTask[];
  dockStates: DockState[];
  events: SimEvent[];

  aisleLocks: Record<string, string>;
  rackOccupancy: Record<string, string>;
  freeRack: string[];
  /** Índice de palets por id (objeto plano, serializable). */
  paletById: Record<string, Pallet>;
  /** Posición de cada ubicación de rack (generada una vez). */
  readonly slotPos: Record<string, { x: number; y: number; z: number; zoneId: ZoneId; level: number }>;
  lanePallets: Record<string, string[]>;

  demand: SimDemand;
  stats: {
    received: number;
    stored: number;
    picked: number;
    prepared: number;
    shipped: number;
    trucksOut: number;
  };

  seq: { truck: number; palet: number; task: number };
  spawnedInbound: number;
  outOrdersSpawned: number;
  outboundDone: string[];

  /** Palets en Expedición esperando ubicación (índice incremental). */
  stagingQueue: string[];
  /** Palets disponibles en picking por categoría térmica. */
  pickingByTemp: Record<'dry' | 'cool' | 'frozen', string[]>;
  /** Huecos de nivel 0 (picking) libres por zona. */
  freeL0ByZone: Record<'seco' | 'frio' | 'congelado', string[]>;
  /** Palets en reserva (nivel 1+) por zona. */
  storedByZone: Record<'seco' | 'frio' | 'congelado', number>;
  /** Acumulador de intervalos para la generación de trabajo. */
  genTimer: number;
}

export interface Machine {
  id: string;
  kind: MachineKind;
  operatorName: string;
  status: MachineStatus;
  battery: number;
  pos: Point;
  heading: number;
  taskId: string | null;
  /** Puntos de ruta restantes (metros). */
  route: Point[];
  /** Velocidad actual (m/s). */
  speed: number;
  hasPalet: boolean;
  liftHeight: number;
  /** Pasillo reservado (id) mientras se desplaza por él. */
  aisleReserved: string | null;
  hoursUsed: number;
  workingRemaining: number;
  carriedPalets: string[];
  batteryEventSent: boolean;
  waitingOnce: boolean;
}

export interface SimContext {
  graph: Graph;
  slotPos: Record<string, { x: number; y: number; z: number; zoneId: ZoneId; level: number }>;
  layout: import('@/lib/layout/types').WarehouseLayout;
}