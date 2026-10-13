import type { WallMesh } from '@/three/builders/build-building';

export type WallMode = 'up' | 'cut' | 'down';

/** Dirección horizontal de la cámara según el ángulo de rotación (índice 0 = sureste). */
export function cameraDir(angleIndex: number) {
  const rot = Math.PI / 4 + angleIndex * (Math.PI / 2);
  return { x: Math.sin(rot), z: Math.cos(rot) };
}

/** Muro que mira a la cámara (su normal apunta hacia ella). */
function facesCamera(normal: { x: number; z: number }, angleIndex: number): boolean {
  const dir = cameraDir(angleIndex);
  return normal.x * dir.x + normal.z * dir.z > 0.35;
}

/** Altura de corte de los cerramientos exteriores que miran a la cámara: media altura, con el borde superior visible. */
export const CUT_OUTER_TOP = 2.8;
/** Altura de corte de los tabiques interiores que miran a la cámara. */
export const CUT_INNER_TOP = 2.5;

/** Altura objetivo de un muro según el modo y el ángulo de la cámara. */
export function wallTargetHeight(wall: { fullTop: number; normal: { x: number; z: number }; outer: boolean }, mode: WallMode, angleIndex: number): number {
  switch (mode) {
    case 'down':
      return 0.3;
    case 'cut': {
      // Solo bajan los muros que miran a la cámara; los del fondo quedan completos y cierran el edificio.
      if (!facesCamera(wall.normal, angleIndex)) return wall.fullTop;
      return Math.min(wall.fullTop, wall.outer ? CUT_OUTER_TOP : CUT_INNER_TOP);
    }
    case 'up':
    default:
      return wall.fullTop;
  }
}

/** Aplica el modo a todos los muros; el escalado en Y se anima en el bucle de la escena. */
export function applyWallMode(walls: WallMesh[], mode: WallMode, angleIndex: number) {
  for (const w of walls) {
    const target = wallTargetHeight(w, mode, angleIndex);
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
    const full = w.fullTop;
    const scaleY = full > 0 ? top / full : 1;
    if (Math.abs(scaleY - w.mesh.scale.y) > 0.0001) {
      w.mesh.scale.y = scaleY;
      w.mesh.position.y = top / 2;
    }
  }
}
