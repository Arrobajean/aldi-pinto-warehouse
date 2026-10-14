import type { ZoneId } from '@/lib/types';

export interface Rect {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export const rectArea = (r: Rect) => (r.xMax - r.xMin) * (r.zMax - r.zMin);

export type StorageKind = 'rack' | 'floor' | 'staging' | 'none';

export interface ZoneInfo {
  id: ZoneId;
  label: string;
  /** Color coherente entre UI y 3D (tokens de zona). */
  color: string;
  temp: string;
  rect: Rect;
  storage: StorageKind;
  /** Niveles de estantería (0 = picking). Solo si storage === 'rack'. */
  levels?: number;
  /** Tramo de racks a lo largo de z (norte → sur) dentro de la zona. */
  rackSegments?: { zStart: number; zEnd: number }[];
}

/** Una línea de estantería: la mitad A o B de un pasillo. */
export interface RackLine {
  /** Línea única dentro de la zona, p. ej. 'S-07-B'. */
  id: string;
  /** Pasillo, p. ej. 'S-07'. */
  aisleId: string;
  zoneId: ZoneId;
  side: 'A' | 'B';
  /** Centro x de la línea (el pasillo queda entre A y B). */
  xCenter: number;
  /** Profundidad de la línea en x (1,1 m). */
  depth: number;
  levels: number;
  /** Segmentos a lo largo de z separados por pasillos transversales. */
  segments: RackSegment[];
}

export interface RackSegment {
  zStart: number;
  zEnd: number;
  /** Número del primer módulo dentro del pasillo (1-based, continuo entre segmentos). */
  firstModule: number;
  /** Módulos completos del segmento (2,7 m cada uno). */
  moduleCount: number;
}

export interface Aisle {
  id: string;
  zoneId: ZoneId;
  /** Centro x del pasillo de 3,2 m. */
  xCenter: number;
}

/** Cara de la nave donde está la puerta (ver dock-geometry.ts). */
export type DockFace = 'south' | 'east';

export interface Dock {
  id: string;
  index: number;
  face: DockFace;
  /** Centro de la puerta (x = 125 en la fachada este; z = 80 en la sur). */
  x: number;
  z: number;
  /** Entrada (proveedores), salida (tiendas) o mixto: carga y descarga (muelles de frío congelado). */
  kind: 'inbound' | 'outbound' | 'mixed';
  temp: 'dry' | 'cool' | 'frozen';
  doorWidth: number;
  levelerDepth: number;
  /** Calle de pre-carga pintada en Expedición (tramo sur) o en la batería este. */
  laneRect: Rect;
}

export interface YardStall {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface SiteElements {
  guardBooth: { x: number; z: number };
  weighbridge: { x: number; z: number };
  /** Depósito contra incendios + caseta de bombas. */
  fireTank: Rect;
  /** Aparcamiento de semirremolques (plazas de 4 × 17 m). */
  truckParking: { stalls: YardStall[] };
  /** Patio de maniobra frente a los muelles. */
  yard: Rect;
  /** Patio de maniobra frente a la batería de muelles este (x = 125). */
  yardEast: Rect;
  /** Puntos de recarga eléctrica de camiones. */
  evChargers: { x: number; z: number }[];
  /** Línea de las barreras de entrada y salida (centro de la isleta de la garita). */
  gate: { x: number; z: number };
  /** Calzadas de acceso y salida de camiones (asfalto), dentro de la parcela. */
  access: Rect[];
}

export interface GraphNode {
  id: string;
  x: number;
  z: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Coste opcional (metros). Se calcula como distancia euclídea si falta. */
  cost?: number;
  /** Si true, la arista es de sentido único (solo from -> to). Si false/undefined, bidireccional. */
  directed?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface LayoutStats {
  /** Superficie de la nave en m²: ancho × fondo de la geometría real (261 × 195 = 50.895 m²), sin la sala anexa. */
  surface: number;
  /** Nº total de ubicaciones de palet. */
  locations: number;
  /** Nº de ubicaciones ocupadas con la semilla fija (~85 %). */
  racksFilled: number;
  dockCount: number;
  aisleCount: number;
}

/** Plaza de una sala: de reposo (máquina aparcada) o de carga (cargador). */
export interface RoomSpot {
  id: string;
  kind: 'reposo' | 'carga';
  x: number;
  z: number;
  /** Fila o columna de la plaza ('w': columna oeste pegada al muro; 'e': columna este). */
  row?: 'n' | 's' | 'w' | 'e';
}

/** Sala de la nave donde se aparcan o recargan las máquinas. */
export interface WarehouseRoom {
  id: string;
  kind: 'reposo' | 'carga';
  label: string;
  rect: Rect;
  spots: RoomSpot[];
  /**
   * Calles de maniobra que se pintan en tono claro. Si falta, se pintan las dos calles de la franja oeste de la nave
   * (x = −118,5 y x = −109,5) a lo largo de todo `rect`. La sala anexa las declara aquí porque tiene las suyas.
   */
  lanes?: Rect[];
}

/** Módulo de aseos con una puerta hacia un pasillo. */
export interface Restroom {
  id: string;
  label: string;
  rect: Rect;
  /** Lado de la puerta y posición a lo largo de ese lado (m). */
  door: { side: 'n' | 's' | 'e' | 'w'; at: number; width: number };
}

/** Flejadora automática: entrada (recogepedidos) y salida (transpaleta ESE). */
export interface Strapper {
  id: string;
  rect: Rect;
  input: { x: number; z: number };
  output: { x: number; z: number };
  /** Segundos de proceso por palé (fleje automático). */
  secondsPerPallet: number;
}

/**
 * Calle de una playa de consolidación: empieza en (x, z) y acaba `length` m más allá en la dirección (dirX, dirZ).
 * Los palés entran por la cabecera (x, z) y la fila se apila hacia el fondo, desde donde recoge la transpaleta.
 */
export interface ConsolidationLane {
  id: string;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  length: number;
}

/** Playa de consolidación: pedidos ya flejados a la espera de la transpaleta que los lleva al muelle. */
export interface ConsolidationArea {
  id: string;
  label: string;
  /** Temperaturas de los palés que se consolidan aquí (la simulación elige la playa por la temperatura del palé). */
  temps: ('dry' | 'cool' | 'frozen')[];
  rect: Rect;
  /** Calles de la playa: una por pedido/muelle en curso; los palés se apilan a lo largo de la calle. */
  lanes: ConsolidationLane[];
  /** Punto de entrega (preparador/flejadora) junto a la cabecera de las calles. La recogida se hace en cada fila. */
  dropPoint: { x: number; z: number };
}

export interface WarehouseLayout {
  parcel: Rect;
  rooms: WarehouseRoom[];
  restrooms: Restroom[];
  strappers: Strapper[];
  consolidation: ConsolidationArea[];
  roadWidth: number;
  building: {
    rect: Rect;
    freeHeight: number;
    /**
     * Ampliación de la nave hacia el oeste (sala de máquinas anexa). No forma parte de `rect`: la nave sigue siendo
     * el rectángulo principal y la anexa es una prolongación a la misma cota de piso (NAVE_FLOOR_H), con el mismo
     * suelo, zócalo y muros a altura completa, sin cubierta. Comparte con la nave el muro x = rect.xMin, que en el
     * tramo de la anexa es un tabique interior (`buildPartitions`, id 'annex-e') con una puerta de 6 m. Quien pregunte
     * si un punto está «dentro de la nave» (cota de piso, malla de navegación) debe contar también este rectángulo.
     */
    annex?: Rect;
  };
  zones: ZoneInfo[];
  aisles: Aisle[];
  rackLines: RackLine[];
  crossAisles: Rect[];
  docks: Dock[];
  site: SiteElements;
  indoorGraph: Graph;
  yardGraph: Graph;
  stats: LayoutStats;
}

/** Posición de un hueco de palet (cada ubicación). */
export interface RackSlot {
  locationId: string;
  zoneId: ZoneId;
  rackLineId: string;
  aisleId: string;
  /** Módulo publicado en el código: impares en el lado B, pares en el A (2·n − 1 / 2·n). */
  module: number;
  level: number;
  slot: 0 | 1 | 2;
  x: number;
  y: number;
  z: number;
}

/** Código de ubicación, p. ej. 'S-07-12-3-B'. */
export function locationId(zoneSymbol: string, aisleNum: number, module: number, level: number, slot: 0 | 1 | 2): string {
  const hueco = String.fromCharCode(65 + slot);
  return `${zoneSymbol}-${String(aisleNum).padStart(2, '0')}-${String(module).padStart(2, '0')}-${level}-${hueco}`;
}

export const ZONE_SYMBOLS: Record<ZoneId, string> = {
  seco: 'S',
  frio: 'F',
  congelado: 'C',
  fyv: 'V',
  expedicion: 'X',
  carga_baterias: 'B',
};