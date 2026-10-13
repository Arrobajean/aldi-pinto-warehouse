import type { WallMesh } from '@/three/builders/build-building';

export type WallMode = 'up' | 'cut' | 'down';

/** Dirección horizontal de la cámara según el ángulo de rotación (índice 0 = sureste). */
export function cameraDir(angleIndex: number) {
  const rot = Math.PI / 4 + angleIndex * (Math.PI / 2);
  return { x: Math.sin(rot), z: Math.cos(rot) };
}

function isOuterCut(normal: { x: number; z: number }, angleIndex: number): boolean {
  const dir = cameraDir(angleIndex);
  return normal.x * dir.x + normal.z * dir.z > 0.35;
}

/** Altura objetivo de un muro según el modo y el ángulo de la cámara. */
export function wallTargetHeight(wall: { fullTop: number; normal: { x: number; z: number } }, mode: WallMode, angleIndex: number): number {
  switch (mode) {
    case 'down':
      return 0.3;
    case 'cut':
      // Tabique interior (no llega al techo): baja para que se vea el interior.
      if (wall.fullTop < 6) return 2.5;
      return isOuterCut(wall.normal, angleIndex) ? 1.0 : wall.fullTop;
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
/**
 * Altura relativa de las estanterías según el modo. Con 4 niveles (≈6,4 m) las estanterías
 * tapan los pasillos desde la vista isométrica; en recorte se bajan para ver las máquinas.
 */
export function rackHeightScale(mode: WallMode): number {
  switch (mode) {
    case 'down':
      return 0.12;
    case 'cut':
      return 0.3;
    case 'up':
    default:
      return 1;
  }
}

/** Anima la escala vertical del grupo de estanterías hacia el modo activo. */
export function updateRackScale(group: { scale: { y: number } } | null, mode: WallMode, dt: number) {
  if (!group) return;
  const k = 8;
  const a = 1 - Math.exp(-k * dt);
  const target = rackHeightScale(mode);
  group.scale.y += (target - group.scale.y) * a;
  if (Math.abs(target - group.scale.y) < 0.0005) group.scale.y = target;
}
