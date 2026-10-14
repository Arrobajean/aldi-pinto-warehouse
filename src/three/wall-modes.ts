import * as THREE from 'three';
import { NAVE_FLOOR_H, type WallMesh } from '@/three/builders/build-building';

export type WallMode = 'up' | 'cut' | 'down';

/** Dirección horizontal de la cámara en el plano XZ (desde el centro de la nave hacia la lente). */
export function cameraDir(rotation: number): { x: number; z: number } {
  return { x: Math.sin(rotation), z: Math.cos(rotation) };
}

/**
 * Determina si un muro está orientado de cara a la cámara (su normal apunta hacia el jugador).
 *
 * Utiliza el producto escalar con un umbral positivo (> 0.05) para asegurar que:
 * 1) En las 4 vistas isométricas diagonales (dot = ±0.707): los 2 muros frontales bajan y los 2 traseros quedan subidos.
 * 2) En las 4 vistas ortogonales cardinales (N, S, E, O): el muro frontal baja y los laterales/trasero quedan subidos.
 */
export function facesCamera(normal: { x: number; z: number }, rotation: number): boolean {
  const dir = cameraDir(rotation);
  return normal.x * dir.x + normal.z * dir.z > 0.05;
}

/** Altura de corte de las fachadas exteriores (2,8 m), dejando zócalo y borde inferior de ventanas/muelles. */
export const CUT_OUTER_TOP = 2.8;
/** Altura de corte de los tabiques interiores de cámaras frigoríficas (2,5 m). */
export const CUT_INNER_TOP = 2.5;
/** Altura de corte de los muros de aseos (1,2 m), permitiendo ver lavabos y sanitarios interiores. */
export const CUT_RESTROOM_TOP = 1.2;

/**
 * Altura objetivo de un muro aplicando las dos reglas de The Sims (Cutaway / Seccionado):
 *
 * 1. Oclusión estática:
 *    - Muros del fondo y laterales lejanos (dot <= 0.05): actúan de telón de fondo y encuadran la escena ->
 *      se mantienen levantados a su altura completa (9,5 m en nave, 3,0 m en aseos).
 *
 * 2. Oclusión de interposición:
 *    - Cualquier muro orientado hacia el observador que se interponga entre la lente isométrica y el interior
 *      de la estancia se recorta automáticamente a su altura de cota baja.
 */
export function wallTargetHeight(
  wall: { fullTop: number; normal: { x: number; z: number }; outer: boolean },
  mode: WallMode,
  rotation: number,
): number {
  switch (mode) {
    case 'down':
      // Modo bajados: todos los muros bajan a nivel de solera/rodapié (0,3 m)
      return 0.3;
    case 'cut': {
      // Regla 1 (Fondo): los muros que dan la espalda a la cámara quedan a altura completa
      if (!facesCamera(wall.normal, rotation)) {
        return wall.fullTop;
      }
      // Regla 2 (Interposición): los muros frontales bajan según su tipología
      if (wall.outer) return Math.min(wall.fullTop, CUT_OUTER_TOP);
      if (wall.fullTop <= 3.5) return Math.min(wall.fullTop, CUT_RESTROOM_TOP);
      return Math.min(wall.fullTop, CUT_INNER_TOP);
    }
    case 'up':
    default:
      return wall.fullTop;
  }
}

/** Escala de altura objetivo (Y) para los racks según el modo de muros. */
export function rackTargetScale(mode: WallMode): number {
  switch (mode) {
    case 'down':
      // Modo bajados: los racks se reducen a huella/solera (8 % de altura), despejando al 100 % los pasillos.
      return 0.08;
    case 'cut':
      // Modo recorte: los racks bajan a cota de picking (~1,9 m, 35 % de altura) para poder ver
      // con total claridad los pasillos y el tráfico de máquinas sin que los niveles altos bloqueen la visión.
      return 0.35;
    case 'up':
    default:
      // Modo completo: altura real de estantería (100 %, 3 niveles × LEVEL_HEIGHT = 5,4 m; la nave libre mide 13 m).
      return 1.0;
  }
}

/** Aplica el modo a todos los muros; el escalado en Y se anima en el bucle de la escena. */
export function applyWallMode(walls: WallMesh[], mode: WallMode, rotation: number) {
  for (const w of walls) {
    const target = wallTargetHeight(w, mode, rotation);
    w.mesh.userData.targetTop = target;
    w.mesh.userData.wallMode = mode;
  }
}

/** Anima la altura de cada muro hacia su objetivo con amortiguación temporal. */
export function updateWalls(walls: WallMesh[], dt: number) {
  const k = 8;
  const a = 1 - Math.exp(-k * dt);
  for (const w of walls) {
    const target = w.mesh.userData.targetTop as number | undefined;
    if (target === undefined) continue;
    let top = w.mesh.userData.currentTop as number | undefined;
    if (top === undefined) {
      top = w.mesh.userData.currentTop = target;
    }
    top += (target - top) * a;
    w.mesh.userData.currentTop = top;
    // Cota superior objetivo (`top`) y base del paño (`baseY`): el muro se estira entre ambas, así los paños por
    // encima de las puertas (base > 0) bajan y desaparecen como el resto al recortar o bajar los muros.
    const base = w.baseY;
    const span = w.fullTop - base;
    const h = Math.max(0, top - base);
    const scaleY = span > 0 ? h / span : 1;
    if (Math.abs(scaleY - w.mesh.scale.y) > 0.0001) {
      w.mesh.scale.y = scaleY;
      w.mesh.position.y = base + h / 2;
    }
  }
}

/**
 * Anima la escala de los racks y la cota de los carteles de pasillo sincronizados con el modo de muros.
 */
export function updateRacks(
  racksGroup: THREE.Group | undefined,
  rackSigns: THREE.Group[] | undefined,
  mode: WallMode,
  dt: number,
) {
  if (!racksGroup) return;
  const target = rackTargetScale(mode);
  let cur = racksGroup.userData.currentScaleY as number | undefined;
  if (cur === undefined) {
    cur = racksGroup.userData.currentScaleY = racksGroup.scale.y || target;
  }
  const k = 8;
  const a = 1 - Math.exp(-k * dt);
  cur += (target - cur) * a;
  racksGroup.userData.currentScaleY = cur;

  if (Math.abs(cur - racksGroup.scale.y) > 0.0001) {
    racksGroup.scale.y = cur;

    // Los carteles colocados en los racks descienden proporcionalmente con la estructura
    if (rackSigns && rackSigns.length > 0) {
      for (const sign of rackSigns) {
        if (sign.userData.baseY === undefined) {
          sign.userData.baseY = sign.position.y;
        }
        const baseY = sign.userData.baseY as number;
        const hAboveFloor = (baseY - NAVE_FLOOR_H) * Math.max(0.2, cur);
        sign.position.y = NAVE_FLOOR_H + hAboveFloor;
      }
    }
  }
}
