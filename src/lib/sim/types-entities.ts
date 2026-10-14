/** Entidades de la simulación: puntos, máquinas, tareas, camiones, palés y muelles. (extraído de types.ts) */

export interface Point {
  x: number;
  z: number;
}

export type MachineKind = 'retractil' | 'frontal' | 'recogepedidos' | 'transpaleta';
export type MachineStatus = 'idle' | 'traveling' | 'working' | 'waiting' | 'charging';

export type TaskKind = 'putaway' | 'replenish' | 'pick' | 'transfer' | 'dock_shift' | 'charge';

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
  /** Flejadora destino de la recogida (entrada, o salida si se flejará a mano). */
  strapperId?: string;
  /** El preparador flejará a mano en la zona de recolección (tren de flejado lleno). */
  manual?: boolean;
  /** Muelles involucrados (p. ej. el de la calle de pre-carga). */
  dockId?: string;
  /**
   * Sección que hace la tarea: de preparación (familia de seco, 'Frío' o 'Congelado') en las recogidas;
   * sector ('seco', 'frio', 'congelado') en ubicación y reposición. Solo la coge una máquina de esa sección.
   */
  section?: string;
  /** Transferencia de un lote de la flejadora a una playa de consolidación (id de la playa), no al muelle. */
  consolidate?: string;
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
  /** Velocidad actual (m/s, sin signo). */
  speed: number;
  /** Rumbo en radianes (la tractora mira a −Z con rotación 0). */
  heading: number;
  /** Velocidad con signo: positiva avanza, negativa marcha atrás. */
  v: number;
  /**
   * Fase de la conducción: carril, arco de atraque, marcha atrás hasta el muelle, salida del muelle
   * y salida de una plaza de espera en marcha atrás.
   */
  stage?: 'lane' | 'arc' | 'reverse' | 'pullout' | 'unpark';
  /** Segundos de espera restantes (báscula). */
  dwell: number;
  /** Plaza de espera ocupada (índice en `layout.site.truckParking.stalls`). */
  stallId: string | null;
  /** Ruta que sigue a la actual (tras salir de la plaza en marcha atrás). */
  nextRoute: Point[];
  /** Muelle del que sale (mientras hace la maniobra de salida). */
  fromDockId: string | null;
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
  /** Metros que le quedan por retroceder para ceder el paso (0 = no cede). */
  yieldLeft?: number;
}

export type PalletState = 'received' | 'staging' | 'stored' | 'picking' | 'prepared' | 'loaded' | 'shipped';

/** Altura total de un palé (m): palé europeo más carga. */
export const PALLET_HEIGHT = 1.6;

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
  /** Fecha de entrada (días desde el ciclo). */
  receivedDay: number;
  /** Caducidad en días desde el ciclo (0 = ya caducado). */
  daysToExpiry: number;
  /** Lote de fabricación. */
  batch: string;
  /** Unidades del artículo en el palet. */
  quantity: number;
}

export interface DockState {
  dockId: string;
  truckId: string | null;
  state: 'free' | 'arriving' | 'loading' | 'unloading';
  paletsProcessed: number;
  totalPalets: number;
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
  /** Altura a la que debe estar la horquilla (nivel del hueco de trabajo). */
  liftTarget: number;
  /** Pasillo reservado (id) mientras se desplaza por él. */
  aisleReserved: string | null;
  /** Plaza de sala asignada (reposo o carga). */
  spot: string | null;
  /** Motivo de la ruta hacia la plaza: aparcar o cargar. */
  mission: 'park' | 'charge' | null;
  hoursUsed: number;
  workingRemaining: number;
  carriedPalets: string[];
  batteryEventSent: boolean;
  waitingOnce: boolean;
  /** Segundos tras el inicio de turno antes de aceptar tareas (fichaje escalonado). */
  clockInDelay: number;
  /** Secciones en las que trabaja (preparadores: secciones de picking; retráctiles: sector). */
  sections?: string[];
  /** Desde cuándo está sin tarea (espera entre tareas antes de volver a aparcar). */
  idleSince?: number;
  /** Celda de la retícula de navegación en la que está (ver navigator.ts). */
  cell?: number;
}
