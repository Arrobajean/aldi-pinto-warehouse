import * as THREE from 'three';
import type { ZoneId } from '@/lib/types';
import type { WarehouseLayout } from '@/lib/layout/types';
import { buildPintoLayout } from '@/lib/layout/pinto-layout';
import { SimsCamera, type SimsZoomLevel } from '@/three/sims-camera';
import { applyWallMode, updateWalls, type WallMode } from '@/three/wall-modes';
import { buildBuilding, type WallMesh } from '@/three/builders/build-building';
import { buildSite } from '@/three/builders/build-site';
import { buildRacks } from '@/three/builders/build-racks';
import { buildLabels } from '@/three/builders/build-labels';
import { createCounterbalance, createOrderPicker, createReachTruck, createTruck, createWorker } from '@/three/builders/models';

export type SceneLayerId = 'racks' | 'pallets' | 'labels' | 'machines' | 'trucks' | 'exterior' | 'shadows';

export interface SceneCallbacks {
  onHoverZone?: (zoneId: ZoneId | null) => void;
  onSelect?: (zoneId: ZoneId | null) => void;
  onFps?: (fps: number) => void;
}

const LAYER_GROUPS: Record<SceneLayerId, string> = {
  racks: 'racks',
  pallets: 'pallets',
  labels: 'labels',
  machines: 'machines',
  trucks: 'trucks',
  exterior: 'exterior',
  shadows: 'shadows',
};

export class WarehouseScene {
  readonly camera: SimsCamera;
  readonly layout: WarehouseLayout;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private raycaster = new THREE.Raycaster();
  private loose = new THREE.Vector2();

  private walls: WallMesh[] = [];
  private groups: Map<string, THREE.Group> = new Map();
  private layerVisibility: Record<SceneLayerId, boolean> = {
    racks: true,
    pallets: true,
    labels: true,
    machines: true,
    trucks: true,
    exterior: true,
    shadows: true,
  };

  private wallMode: WallMode = 'cut';
  private quality = { shadows: true };

  private container: HTMLElement;
  private callbacks: SceneCallbacks;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private dragState: { x: number; y: number } | null = null;
  private moved = false;
  private hoverZoneId: ZoneId | null = null;

  private followTarget: THREE.Object3D | null = null;

  constructor(container: HTMLElement, callbacks: SceneCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.layout = buildPintoLayout();

    const width = container.clientWidth;
    const height = container.clientHeight;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0b1220);

    this.camera = new SimsCamera(width, height);
    this.addLights();
    this.buildWorld();

    window.addEventListener('resize', this.onResize);
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointerleave', this.onPointerLeave);
    this.container.addEventListener('wheel', this.onWheel, { passive: false });
    this.container.addEventListener('dblclick', this.onDblClick);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('touchstart', this.onTouchStart, { passive: false });
    window.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('touchend', this.onTouchEnd);

    this.clock.start();
    this.loop();
  }

  private addLights() {
    const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x0b1220, 1.0);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2df, 2.2);
    sun.castShadow = true;
    sun.position.set(120, 220, 90);
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 700;
    this.scene.add(sun);
    this.scene.userData.sun = sun;

    const ambient = new THREE.AmbientLight(0x9fb4d0, 0.35);
    this.scene.add(ambient);
  }

  private buildWorld() {
    const layout = this.layout;
    const site = buildSite(layout);
    const building = buildBuilding(layout);
    const racks = buildRacks(layout);
    const labels = buildLabels(layout);

    const siteGroup = new THREE.Group();
    siteGroup.name = 'exterior';
    siteGroup.add(site);
    this.scene.add(siteGroup);

    const buildingGroup = new THREE.Group();
    buildingGroup.add(building.group);
    this.scene.add(buildingGroup);
    this.walls = [...building.outerWalls, ...building.innerWalls];

    const racksGroup = new THREE.Group();
    racksGroup.name = 'racks';
    racksGroup.add(racks);
    this.scene.add(racksGroup);

    const labelsGroup = new THREE.Group();
    labelsGroup.name = 'labels';
    labelsGroup.add(labels);
    labelsGroup.visible = this.layerVisibility.labels;
    this.scene.add(labelsGroup);

    const machinesGroup = new THREE.Group();
    machinesGroup.name = 'machines';
    this.scene.add(machinesGroup);
    const trucksGroup = new THREE.Group();
    trucksGroup.name = 'trucks';
    this.scene.add(trucksGroup);

    // Máquinas y camiones estáticos para validar la escala (F1).
    const reach = createReachTruck();
    reach.group.position.set(-68.7, 0, 40);
    machinesGroup.add(reach.group);
    const front = createCounterbalance();
    front.group.position.set(-94, 0, 78);
    front.group.rotation.y = Math.PI / 2;
    machinesGroup.add(front.group);
    const picker = createOrderPicker();
    picker.group.position.set(52, 0, 8);
    machinesGroup.add(picker.group);

    const reefer = createTruck({ reefer: true });
    reefer.group.position.set(-94, 0, 68.4);
    trucksGroup.add(reefer.group);
    const dry = createTruck({ reefer: false });
    dry.group.position.set(-40, 0, 112);
    dry.group.rotation.y = Math.PI;
    trucksGroup.add(dry.group);

    const worker = createWorker();
    worker.group.position.set(-66, 0, 44);
    machinesGroup.add(worker.group);

    this.groups.set('site', siteGroup);
    this.groups.set('building', buildingGroup);
    this.groups.set('racks', racksGroup);
    this.groups.set('labels', labelsGroup);
    this.groups.set('machines', machinesGroup);
    this.groups.set('trucks', trucksGroup);

    applyWallMode(this.walls, this.wallMode, this.camera.getAngleIndex());
  }

  // --- Capas ---
  setLayer(layer: SceneLayerId, visible: boolean) {
    this.layerVisibility[layer] = visible;
    const racks = this.groups.get('racks');
    if (layer === 'shadows') {
      this.renderer.shadowMap.enabled = visible;
      return;
    }
    if (racks) {
      const applyRackLayer = (name: string, v: boolean) => {
        racks.traverse((o) => {
          if (o instanceof THREE.InstancedMesh && o.name === name) o.visible = v;
        });
      };
      if (layer === 'racks') {
        applyRackLayer('posts', visible);
        applyRackLayer('beams', visible);
        return;
      }
      if (layer === 'pallets') {
        applyRackLayer('pallets', visible);
        return;
      }
    }
    const key = LAYER_GROUPS[layer];
    const group = this.groups.get(key);
    if (group) group.visible = visible;
  }

  setLayers(layers: Partial<Record<SceneLayerId, boolean>>) {
    for (const [k, v] of Object.entries(layers)) this.setLayer(k as SceneLayerId, Boolean(v));
  }

  setShadowsQuality(enabled: boolean) {
    this.quality.shadows = enabled;
    this.renderer.shadowMap.enabled = enabled;
  }

  // --- Cámara / muros ---
  rotate(dir: 1 | -1) {
    this.camera.rotate(dir);
    this.syncWallMode();
  }

  setZoomLevel(level: SimsZoomLevel) {
    this.camera.setZoomLevel(level);
  }

  focusZone(zoneId: ZoneId) {
    this.camera.focusZone(zoneId);
  }

  focusGeneral() {
    this.camera.focusGeneral();
  }

  setWallMode(mode: WallMode) {
    this.wallMode = mode;
    this.syncWallMode();
  }

  getWallMode() {
    return this.wallMode;
  }

  private syncWallMode() {
    applyWallMode(this.walls, this.wallMode, this.camera.getAngleIndex());
  }

  // --- Picking ---
  private toNdc(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.loose.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    return this.loose;
  }

  private pickZones(clientX: number, clientY: number): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.toNdc(clientX, clientY), this.camera.camera);
    const floors: THREE.Object3D[] = [];
    const building = this.groups.get('building');
    if (building) {
      building.traverse((o) => {
        if (o.userData.zoneId && o.type === 'Mesh') floors.push(o);
      });
    }
    return this.raycaster.intersectObjects(floors, false);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dragState = { x: e.clientX, y: e.clientY };
    this.moved = false;
    if (e.pointerType === 'mouse' && e.button === 0) {
      this.container.setPointerCapture?.(e.pointerId);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.dragState) {
      const dx = e.clientX - this.dragState.x;
      const dy = e.clientY - this.dragState.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      this.camera.pan(dx, dy);
      this.dragState = { x: e.clientX, y: e.clientY };
      return;
    }
    const hits = this.pickZones(e.clientX, e.clientY);
    const zoneId = (hits[0]?.object.userData.zoneId as ZoneId | undefined) ?? null;
    if (zoneId !== this.hoverZoneId) {
      this.hoverZoneId = zoneId;
      this.callbacks.onHoverZone?.(zoneId);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragState && !this.moved) {
      const hits = this.pickZones(e.clientX, e.clientY);
      const zoneId = (hits[0]?.object.userData.zoneId as ZoneId | undefined) ?? null;
      this.callbacks.onSelect?.(zoneId);
    }
    this.dragState = null;
  };

  private onPointerLeave = () => {
    this.dragState = null;
    if (this.hoverZoneId) {
      this.hoverZoneId = null;
      this.callbacks.onHoverZone?.(null);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camera.wheel(e.deltaY);
  };

  private onDblClick = () => {
    this.camera.focusGeneral();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    switch (e.key.toLowerCase()) {
      case 'q':
        this.rotate(-1);
        break;
      case 'e':
        this.rotate(1);
        break;
      case '1':
        this.setZoomLevel(1);
        break;
      case '2':
        this.setZoomLevel(2);
        break;
      case '3':
        this.setZoomLevel(3);
        break;
      case 'w':
      case 'arrowup':
        this.camera.pan(0, -40);
        break;
      case 's':
      case 'arrowdown':
        this.camera.pan(0, 40);
        break;
      case 'a':
      case 'arrowleft':
        this.camera.pan(-40, 0);
        break;
      case 'd':
      case 'arrowright':
        this.camera.pan(40, 0);
        break;
      case 'm':
        this.setWallMode(this.wallMode === 'up' ? 'cut' : this.wallMode === 'cut' ? 'down' : 'up');
        break;
      case 'f':
        this.focusGeneral();
        break;
      default:
        break;
    }
  };

  // Táctil: un dedo desplaza, pellizco hace zoom.
  private pinchDistance = 0;
  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = Array.from(e.touches);
      this.pinchDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = Array.from(e.touches);
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const prev = this.pinchDistance || d;
      this.camera.wheel((prev - d) * 2);
      this.pinchDistance = d;
    }
  };

  private onTouchEnd = () => {
    this.pinchDistance = 0;
  };

  private onResize = () => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.onResize(width, height);
    this.renderer.setSize(width, height);
  };

  // --- Bucle ---
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.camera.update(dt);
    updateWalls(this.walls, dt);

    const sun = this.scene.userData.sun as THREE.DirectionalLight | undefined;
    if (sun) {
      const at = this.camera.currentLookAt;
      sun.position.set(at.x + 120, 220, at.z + 90);
      sun.target.position.copy(at);
      sun.target.updateMatrixWorld();
      const zoom = this.camera.getZoomLevel();
      const size = zoom === 3 ? 140 : zoom === 2 ? 70 : 34;
      sun.shadow.camera.left = -size;
      sun.shadow.camera.right = size;
      sun.shadow.camera.top = size;
      sun.shadow.camera.bottom = -size;
      sun.shadow.camera.updateProjectionMatrix();
    }

    if (this.followTarget) {
      this.camera.setFollowPosition(this.followTarget.position.x, this.followTarget.position.z);
    }

    this.renderer.render(this.scene, this.camera.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.removeEventListener('wheel', this.onWheel);
    this.container.removeEventListener('dblclick', this.onDblClick);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onTouchEnd);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) mat.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}