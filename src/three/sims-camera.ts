import * as THREE from 'three';
import type { ZoneId } from '@/lib/types';

export type SimsZoomLevel = 1 | 2 | 3;
export type SimsFollow = string | null;

interface Vec2Like {
  x: number;
  z: number;
}

const FRUSTUM_SIZE = 100; // 100 m verticales visibles con zoom 1
const DISTANCE = 800;
const PITCH = Math.atan(1 / Math.SQRT2); // isométrica ~35,26º

const ZOOM_LEVELS: Record<SimsZoomLevel, number> = {
  1: 4,
  2: 1.4,
  3: 0.32,
};

const ZONE_TARGETS: Partial<Record<ZoneId, Vec2Like>> = {
  seco: { x: -40, z: -12 },
  frio: { x: 78, z: -52 },
  congelado: { x: 97, z: 12 },
  expedicion: { x: 0, z: 65 },
  carga_baterias: { x: -115, z: -60 },
};

const BOUNDS = { xMin: -215, xMax: 262, zMin: -155, zMax: 190 };

export class SimsCamera {
  readonly camera: THREE.OrthographicCamera;

  private targetAngleIndex = 0;
  private currentRotation = Math.PI / 4;
  private targetRotation = Math.PI / 4;

  private currentZoom = ZOOM_LEVELS[3];
  private targetZoom = ZOOM_LEVELS[3];
  private currentZoomLevel: SimsZoomLevel = 3;

  readonly targetLookAt = new THREE.Vector3(0, 2, 10);
  readonly currentLookAt = new THREE.Vector3(0, 2, 10);

  private canvasHeight = 600;
  private follow: SimsFollow = null;

  constructor(width: number, height: number) {
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(
      (-FRUSTUM_SIZE * aspect) / 2,
      (FRUSTUM_SIZE * aspect) / 2,
      FRUSTUM_SIZE / 2,
      -FRUSTUM_SIZE / 2,
      1,
      3000,
    );
    this.canvasHeight = height;
    this.updateCameraPosition();
  }

  onResize(width: number, height: number) {
    this.canvasHeight = height || 600;
    if (height <= 0 || width <= 0) return;
    const aspect = width / height;
    this.camera.left = (-FRUSTUM_SIZE * aspect) / 2;
    this.camera.right = (FRUSTUM_SIZE * aspect) / 2;
    this.camera.top = FRUSTUM_SIZE / 2;
    this.camera.bottom = -FRUSTUM_SIZE / 2;
    this.camera.updateProjectionMatrix();
    this.updateCameraPosition();
  }

  rotate(direction: 1 | -1) {
    this.targetAngleIndex = (this.targetAngleIndex + direction + 4) % 4;
    this.targetRotation += direction * (Math.PI / 2);
  }

  getAngleIndex() {
    return this.targetAngleIndex;
  }

  getRotation(): number {
    return this.currentRotation;
  }

  getTargetRotation(): number {
    return this.targetRotation;
  }

  setTargetRotation(target: number) {
    const twoPi = Math.PI * 2;
    const currentNorm = ((this.currentRotation % twoPi) + twoPi) % twoPi;
    const targetNorm = ((target % twoPi) + twoPi) % twoPi;
    let diff = targetNorm - currentNorm;
    if (diff > Math.PI) diff -= twoPi;
    if (diff < -Math.PI) diff += twoPi;
    this.targetRotation = this.currentRotation + diff;
    const finalNorm = ((this.targetRotation % twoPi) + twoPi) % twoPi;
    this.targetAngleIndex = Math.round((finalNorm - Math.PI / 4) / (Math.PI / 2) + 4) % 4;
  }

  lookTowards(cardinal: 'N' | 'S' | 'E' | 'O') {
    const angles: Record<'N' | 'S' | 'E' | 'O', number> = {
      N: 0,
      O: Math.PI / 2,
      S: Math.PI,
      E: -Math.PI / 2,
    };
    this.setTargetRotation(angles[cardinal]);
  }

  setZoomLevel(level: SimsZoomLevel) {
    this.currentZoomLevel = level;
    this.targetZoom = ZOOM_LEVELS[level];
  }

  getZoomLevel(): SimsZoomLevel {
    return this.currentZoomLevel;
  }

  /** Zoom continuo con la rueda entre 0,25 y 6. */
  wheel(deltaY: number) {
    this.targetZoom = THREE.MathUtils.clamp(this.targetZoom * Math.exp(-deltaY * 0.002), 0.25, 6);
    const order: SimsZoomLevel[] = [1, 2, 3];
    let best = order[0];
    let bestDist = Infinity;
    for (const lvl of order) {
      const d = Math.abs(this.targetZoom - ZOOM_LEVELS[lvl]) / ZOOM_LEVELS[lvl];
      if (d < bestDist) {
        bestDist = d;
        best = lvl;
      }
    }
    this.currentZoomLevel = best;
  }

  /** Desplazamiento con el arrastre: metros por píxel según el zoom. */
  pan(px: number, py: number) {
    const mp = FRUSTUM_SIZE / this.currentZoom / this.canvasHeight;
    const rot = this.currentRotation;
    const cx = Math.cos(rot);
    const sx = Math.sin(rot);
    const right = { x: cx, z: -sx };
    const forward = { x: -sx, z: -cx };
    const depthScale = 1 / Math.sin(PITCH);
    this.targetLookAt.x -= right.x * px * mp;
    this.targetLookAt.z -= right.z * px * mp;
    this.targetLookAt.x += forward.x * py * mp * depthScale;
    this.targetLookAt.z += forward.z * py * mp * depthScale;
    this.targetLookAt.x = THREE.MathUtils.clamp(this.targetLookAt.x, BOUNDS.xMin, BOUNDS.xMax);
    this.targetLookAt.z = THREE.MathUtils.clamp(this.targetLookAt.z, BOUNDS.zMin, BOUNDS.zMax);
  }

  focusOn(point: Vec2Like, level?: SimsZoomLevel) {
    this.targetLookAt.set(point.x, 2, point.z);
    if (level) this.setZoomLevel(level);
  }

  focusZone(zoneId: ZoneId) {
    const t = ZONE_TARGETS[zoneId];
    if (t) {
      this.targetLookAt.set(t.x, 2, t.z);
      this.setZoomLevel(2);
    }
  }

  focusGeneral() {
    this.targetLookAt.set(0, 2, 10);
    this.setZoomLevel(3);
  }

  followEntity(id: SimsFollow) {
    this.follow = id;
  }

  /** La escena llama a esto cada frame con la posición de la entidad seguida. */
  setFollowPosition(x: number, z: number) {
    if (this.follow === null) return;
    this.targetLookAt.set(x, 2, z);
    if (this.getZoomLevel() !== 1) this.setZoomLevel(1);
  }

  get followId() {
    return this.follow;
  }

  update(dt: number) {
    this.currentRotation += (this.targetRotation - this.currentRotation) * (1 - Math.exp(-6 * dt));
    const prevZoom = this.camera.zoom;
    this.currentZoom += (this.targetZoom - this.currentZoom) * (1 - Math.exp(-8 * dt));
    this.currentLookAt.lerp(this.targetLookAt, 1 - Math.exp(-10 * dt));
    if (Math.abs(this.currentZoom - prevZoom) > 1e-4) {
      this.camera.zoom = this.currentZoom;
      this.camera.updateProjectionMatrix();
    }
    this.updateCameraPosition();
  }

  private updateCameraPosition() {
    const offsetX = DISTANCE * Math.cos(PITCH) * Math.sin(this.currentRotation);
    const offsetY = DISTANCE * Math.sin(PITCH);
    const offsetZ = DISTANCE * Math.cos(PITCH) * Math.cos(this.currentRotation);
    this.camera.position.set(this.currentLookAt.x + offsetX, this.currentLookAt.y + offsetY, this.currentLookAt.z + offsetZ);
    this.camera.lookAt(this.currentLookAt);
  }
}