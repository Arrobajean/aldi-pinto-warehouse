/** Estado completo de la simulación y su contexto. (extraído de types.ts) */

import type { Graph } from '@/lib/layout/types';
import type { SimDemand } from '@/lib/sim/types-demand';
import type { DockState, Machine, Pallet, SimTask, Truck } from '@/lib/sim/types-entities';
import type { SimEvent } from '@/lib/sim/types-events';
import type { ZoneId } from '@/lib/types';

export interface SimState {
  ts: number;
  running: boolean;
  speed: number;
  startTs: number;
  seed: number;
  rngState: number;
  shiftId: 'noche' | 'mañana' | 'tarde';
  /** Presupuesto de bultos del turno en curso: lo que aún se puede preparar en él. */
  preparacion: { turno: 'noche' | 'mañana' | 'tarde'; restante: Record<Pallet['temp'], number> };
  lastShiftChange: number;

  machines: Machine[];
  trucks: Truck[];
  pallets: Pallet[];
  tasks: SimTask[];
  dockStates: DockState[];
  events: SimEvent[];

  /** Máquinas que circulan por cada pasillo (máximo AISLE_CAPACITY). */
  aisleLocks: Record<string, string[]>;
  /** Plaza de sala (reposo o carga) → máquina que la ocupa. */
  spotOccupancy: Record<string, string>;
  rackOccupancy: Record<string, string>;
  /** Huecos de rack cuyo contenido ha cambiado desde que la escena lo leyó. */
  rackDirty: string[];
  freeRack: string[];
  /** Índice de palets por id (objeto plano, serializable). */
  paletById: Record<string, Pallet>;
  /** Posición de cada ubicación de rack (generada una vez). */
  readonly slotPos: Record<string, { x: number; y: number; z: number; zoneId: ZoneId; level: number }>;
  lanePallets: Record<string, string[]>;
  /** Pedidos preparados en la zona de preparación, pendientes de llevar al muelle (transpaleta ESE). */
  /** Flejadoras: cola de entrada, lote en proceso y lotes ya flejados (salida) para la transpaleta ESE. */
  strappers: { id: string; queue: { dockId: string; paletIds: string[] }[]; current: { dockId: string; paletIds: string[]; doneAt: number } | null }[];
  strapOut: { dockId: string; paletIds: string[]; strapperId: string }[];

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
  /** Índice del primer pedido de la agenda que aún no ha salido (ver outbound-window.ts). */
  outOrdersSpawned: number;
  /** Pedidos que ya tienen camión asignado (en el patio o ya salidos). */
  lanzados: Record<string, boolean>;
  outboundDone: string[];

  /** Palets en Expedición esperando ubicación (índice incremental). */
  stagingQueue: string[];
  /** Palets disponibles en picking por categoría térmica. */
  pickingByTemp: Record<'dry' | 'cool' | 'frozen', string[]>;
  /** Palets disponibles en picking por sección de preparación. */
  pickingBySection: Record<string, string[]>;
  /** Palés de cada pedido que faltan por mandar a preparar, por sección (pedido → sección → palés). */
  pickRemaining: Record<string, Record<string, number>>;
  /** De lo que falta de cada sección, cuántos palés son cárnicos o vegetales (solo los prepara el turno de tarde). */
  pickCarne: Record<string, Record<string, number>>;
  /**
   * Ruta de frío de cada pedido: palés repartidos por los pasillos 1…9 en orden de recorrido (serpentina). Cada lote
   * saca los siguientes de la lista, así que el preparador va de pasillo en pasillo. Se reserva al crearla.
   */
  pickRoutes?: Record<string, string[]>;
  /**
   * Playas de consolidación (seco; frío y congelado): por muelle y playa (`muelle|playa`), la calle reservada y
   * los palés ya flejados que esperan en ella a que se complete su parte del pedido.
   */
  consolidation: Record<string, { dockId: string; areaId: string; laneId: string; paletIds: string[] }>;
  /** Huecos de nivel 0 (picking) libres por zona. */
  freeL0ByZone: Record<'seco' | 'frio' | 'congelado', string[]>;
  /** Palets en reserva (nivel 1+) por zona. */
  storedByZone: Record<'seco' | 'frio' | 'congelado', number>;
  /** Acumulador de intervalos para la generación de trabajo. */
  genTimer: number;

  /** Plaza de espera de semirremolques → camión que la ocupa. */
  stallOccupancy: Record<string, string>;
  /** Última entrada por la garita (separación mínima entre camiones). */
  lastGateAt: number;
  /** Camión que ocupa la báscula (un único puesto). */
  scaleTruckId: string | null;
  /** Última salida de una plaza de espera hacia un muelle (se escalonan). */
  lastStallExitAt: number;
  /** Última máquina que dejó su plaza de la sala para trabajar (se liberan de una en una). */
  lastSpotReleaseAt: number;
  /** Zonas del patio reservadas por camiones (maniobras y cruces). */
  zoneClaims: import('@/lib/sim/traffic').ZoneClaim[];
}

export interface SimContext {
  graph: Graph;
  slotPos: Record<string, { x: number; y: number; z: number; zoneId: ZoneId; level: number }>;
  layout: import('@/lib/layout/types').WarehouseLayout;
}
