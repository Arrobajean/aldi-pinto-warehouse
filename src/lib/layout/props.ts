/**
 * Mobiliario y señalización exterior/interior del almacén: cubos de basura, postes de señal, carteles de pared y
 * pasos peatonales. Es geometría pura (sin THREE ni aleatoriedad): la escena la dibuja y `scripts/check-props.ts`
 * comprueba que nada corta un pasillo, una calle de camiones ni una estantería. No interviene en la simulación.
 */

import type { WarehouseLayout } from '@/lib/layout/types';
import { dockBlocks, dockStairX } from '@/three/builders/build-building';

/** Fracción de reciclaje del cubo (color y rótulo). */
export type BinKind = 'resto' | 'papel' | 'envases' | 'vidrio';

export interface PropBin {
  x: number;
  z: number;
  kind: BinKind;
}

/** Señal: pictograma que se pinta en la cara del cartel. */
export type SignKind = 'speed10' | 'pedestrian' | 'exit' | 'assembly';

/** Poste de señal en el suelo (el cartel mira a +Z si rotY = 0). */
export interface PropPost {
  x: number;
  z: number;
  kind: SignKind;
  /** Cota del centro del cartel (m). */
  height: number;
  /** Giro del cartel alrededor de Y (rad). */
  rotY: number;
}

/** Cartel fijado a una pared exterior. */
export interface PropWallSign {
  x: number;
  y: number;
  z: number;
  kind: SignKind;
  /** Ancho del cartel (m). Alto fijo de 0,5 m. */
  width: number;
  /** Giro alrededor de Y: 0 mira a +Z. */
  rotY: number;
}

/**
 * Paso de cebra. Las rayas son largas en la dirección del tráfico (`trafficAxis`) y se reparten en la dirección
 * que cruza el peatón, a lo largo de `span` metros centrados en (cx, cz).
 */
export interface Crosswalk {
  cx: number;
  cz: number;
  trafficAxis: 'x' | 'z';
  /** Longitud de cada raya (m), en la dirección del tráfico. */
  stripeLen: number;
  /** Ancho total que cubre el paso (m), en la dirección del peatón. */
  span: number;
  /** Número de rayas. */
  stripes: number;
}

export interface YardProps {
  bins: PropBin[];
  posts: PropPost[];
  wallSigns: PropWallSign[];
  crosswalks: Crosswalk[];
}

/** Carril de camiones que cruza el patio sur de Este a Oeste (z = 105, nodos `yard-*` de la simulación). */
const YARD_THROUGH_Z = 105;

export function buildYardProps(layout: WarehouseLayout): YardProps {
  const bins: PropBin[] = [];
  const posts: PropPost[] = [];
  const wallSigns: PropWallSign[] = [];
  const crosswalks: Crosswalk[] = [];

  // Patio sur: en cada bloque de muelles, la escalera peatonal baja al patio. Allí: cubos y paso de cebra sobre el carril.
  const southBlocks = dockBlocks(layout.docks).filter((b) => b.face === 'south');
  for (const block of southBlocks) {
    const su = dockStairX(block);
    (['resto', 'papel', 'envases'] as const).forEach((kind, i) => {
      bins.push({ x: su - 3.0 + i * 0.7, z: 86.4, kind });
    });
    crosswalks.push({ cx: su, cz: YARD_THROUGH_Z, trafficAxis: 'x', stripeLen: 3.6, span: 8, stripes: 7 });
    posts.push({ x: su - 2.4, z: 112.6, kind: 'pedestrian', height: 2.2, rotY: Math.PI });
  }

  // Límite de velocidad en los accesos del patio (fuera del carril).
  posts.push({ x: -133.5, z: 118, kind: 'speed10', height: 2.1, rotY: 0 });
  posts.push({ x: 208, z: 118, kind: 'speed10', height: 2.1, rotY: Math.PI });

  // Aparcamiento de camiones: cubos para los conductores, junto a la primera fila de plazas.
  bins.push({ x: -62.5, z: 126.5, kind: 'resto' }, { x: -61.5, z: 126.5, kind: 'envases' });

  // Nave: zona de expedición (oeste) y junto a la salida del aseo WC-02.
  bins.push({ x: -121, z: 60, kind: 'resto' }, { x: -120.2, z: 60, kind: 'vidrio' });
  bins.push({ x: -119.5, z: 67, kind: 'resto' }, { x: -118.7, z: 67, kind: 'papel' });

  // Carteles de pared en la fachada sur, en los tramos sin puertas: punto de encuentro y salida de emergencia.
  wallSigns.push({ x: -33, y: 2.6, z: 80.03, kind: 'assembly', width: 1.2, rotY: 0 });
  wallSigns.push({ x: 112, y: 2.6, z: 80.03, kind: 'exit', width: 1.2, rotY: 0 });

  // Gate: paso de peatones entre la garita y la acera, cruzando los dos carriles de acceso (E-O).
  crosswalks.push({ cx: 222, cz: 173, trafficAxis: 'x', stripeLen: 3.6, span: 10, stripes: 9 });
  posts.push({ x: 219.5, z: 182.2, kind: 'pedestrian', height: 2.2, rotY: Math.PI });

  return { bins, posts, wallSigns, crosswalks };
}
