/** Eventos de la simulación (los que muestra el feed de la interfaz). (extraído de types.ts) */

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
  id?: string;
  ts: number;
  type: SimEventType;
  message: string;
  meta?: Record<string, unknown>;
}
