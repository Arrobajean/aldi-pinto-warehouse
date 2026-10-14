export const PROVINCES = [
  'Madrid',
  'Toledo',
  'Segovia',
  'Ávila',
  'Guadalajara',
  'Ciudad Real',
  'Cáceres',
  'Salamanca',
] as const;

export type Province = (typeof PROVINCES)[number];

export type ZoneId = 'seco' | 'frio' | 'congelado' | 'fyv' | 'expedicion' | 'carga_baterias';

export type TemperatureCategory = 'Seco' | 'Frío' | 'Congelado' | 'Multitemperatura';

export interface StoreDestination {
  id: string;
  name: string;
  province: Province;
  town: string;
  address: string;
  distanceKm: number;
  palletsPerDay: number;
  temperatureCategory: TemperatureCategory;
}

export interface RagDocumentChunk {
  id: string;
  title: string;
  category: 'almacen' | 'tiendas' | 'frio' | 'maquinaria' | 'operaciones' | 'seguridad' | 'productos';
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
    relevance: number;
    snippet: string;
  }[];
}