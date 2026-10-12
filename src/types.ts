export type WarehouseZone = 'seco' | 'frio' | 'congelado' | 'muelles' | 'staging';

export type MachineType = 'retractil' | 'frontal' | 'transpaleta' | 'camion';

export interface WarehouseAgent {
  id: string;
  name: string;
  type: MachineType;
  zone: WarehouseZone;
  operatorName: string;
  battery: number; // 0 - 100%
  status: 'working' | 'moving' | 'lifting' | 'idle' | 'charging';
  currentTask: string;
  assignedStore?: string;
  targetPosition: [number, number, number];
  position: [number, number, number];
  rotation: number;
  speed: number;
  heightLevel?: number; // For reach trucks lifting forks
  targetHeight?: number;
  hasPallet: boolean;
  palletColor?: string;
}

export interface StoreDestination {
  id: string;
  name: string;
  province: 'Madrid' | 'Toledo' | 'Segovia' | 'Ávila';
  address: string;
  distanceKm: number;
  orderStatus: 'Entregado' | 'En Ruta' | 'Cargando en Muelle' | 'En Picking' | 'Programado';
  dockAssigned: string;
  departureTime: string;
  estimatedArrival: string;
  palletsCount: number;
  temperatureCategory: 'Seco' | 'Frío' | 'Congelado' | 'Multitemperatura';
}

export interface DockBay {
  id: string;
  name: string;
  status: 'occupied' | 'empty' | 'loading' | 'unloading';
  truckPlate: string;
  destinationStore?: string;
  progressPercent: number;
  cargoType: string;
}

export interface RagDocumentChunk {
  id: string;
  title: string;
  category: 'almacen' | 'tiendas' | 'frio' | 'maquinaria' | 'operaciones' | 'seguridad';
  content: string;
  keywords: string[];
}

export interface RagMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: {
    title: string;
    category: string;
    relevance: number; // 0 - 100%
    snippet: string;
  }[];
}

export interface WarehouseMetrics {
  totalPallets: number;
  capacityMax: number;
  occupancyRate: number;
  activeDocks: number;
  totalDocks: number;
  tempFrio: number;
  tempCongelado: number;
  palletsMovedToday: number;
  activePickers: number;
  storesServedToday: number;
  totalStores: number;
}
