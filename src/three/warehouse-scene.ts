import * as THREE from 'three';
import type { ZoneId } from '@/lib/types';
import type { WarehouseLayout } from '@/lib/layout/types';
import { buildPintoLayout } from '@/lib/layout/pinto-layout';
import type { SimState } from '@/lib/sim/types';
import { SimsCamera, type SimsZoomLevel } from '@/three/sims-camera';
import { applyWallMode, updateWalls, type WallMode } from '@/three/wall-modes';
import { EntitySync } from '@/three/entity-sync';
import { RtlsLayers } from '@/three/rtls-layers';
import { createBrandDecal, loadBranding } from '@/three/branding';
import type { SmoothedTrack } from '@/lib/rtls/types';
import { buildBuilding, type WallMesh } from '@/three/builders/build-building';
import { buildSite } from '@/three/builders/build-site';
import { buildRacks, type RacksModel } from '@/three/builders/build-racks';
import { buildDockLabels, buildLabels } from '@/three/builders/build-labels';
import { buildSlotPositions } from '@/lib/sim/positions';
import { colorForStock, type StockColorMode } from '@/lib/stock/colors';
import { articleForSku } from '@/lib/stock/catalog';

export type SceneLayerId = 'racks' | 'pallets' | 'labels' | 'machines' | 'trucks' | 'exterior' | 'shadows';

export interface StockSelection {
  locId: string;
  empty: boolean;
  sku?: string;
  expiryDays?: number;
  x: number;
  y: number;
  z: number;
}

export interface SceneCallbacks {
  onHoverZone?: (zoneId: ZoneId | null) => void;
  onSelect?: (zoneId: ZoneId | null) => void;
  onSelectEntity?: (kind: 'machine' | 'truck', id: string) => void;
  onHoverEntity?: (kind: 'machine' | 'truck', id: string) => void;
  onSelectStock?: (selection: StockSelection) => void;
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
  private hoverEntityId: string | null = null;
  private machinesGroup!: THREE.Group;
  private trucksGroup!: THREE.Group;
  private entitySync: EntitySync | null = null;
  private simStateRef: SimState | null = null;
  private rtlsLayers: RtlsLayers | null = null;
  private racksModel: RacksModel | null = null;
  private slotPos = new Map<string, { x: number; y: number; z: number }>();
  private highlight: THREE.Mesh | null = null;
  private highlightUntil = 0;

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
    this.racksModel = buildRacks(layout);
    racksGroup.add(this.racksModel.group);
    this.scene.add(racksGroup);

    // Índice de posiciones de ubicaciones para el stock.
    const slotPositions = buildSlotPositions(layout);
    for (const [loc, v] of Object.entries(slotPositions)) this.slotPos.set(loc, v);

    // Marcador de resaltado (lo coloca el buscador o el foco).
    this.highlight = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 5, 1.05),
      new THREE.MeshBasicMaterial({ color: 0x22a6e0, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.highlight.visible = false;
    this.highlight.position.y = 2.5;
    this.scene.add(this.highlight);

    const labelsGroup = new THREE.Group();
    labelsGroup.name = 'labels';
    labelsGroup.add(labels);
    labelsGroup.add(buildDockLabels(layout));
    labelsGroup.visible = this.layerVisibility.labels;
    this.scene.add(labelsGroup);

    const machinesGroup = new THREE.Group();
    machinesGroup.name = 'machines';
    this.machinesGroup = machinesGroup;
    this.scene.add(machinesGroup);
    const trucksGroup = new THREE.Group();
    trucksGroup.name = 'trucks';
    this.trucksGroup = trucksGroup;
    this.scene.add(trucksGroup);

    this.groups.set('site', siteGroup);
    this.groups.set('building', buildingGroup);
    this.groups.set('racks', racksGroup);
    this.groups.set('labels', labelsGroup);
    this.groups.set('machines', machinesGroup);
    this.groups.set('trucks', trucksGroup);

    // Placa de marca en la fachada sur (sobre los muelles).
    const facadeLogo = createBrandDecal(3.8, 4.0);
    facadeLogo.position.set(0, 6.8, layout.building.rect.zMax + 0.42);
    this.scene.add(facadeLogo);

    applyWallMode(this.walls, this.wallMode, this.camera.getAngleIndex());
    void loadBranding();
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
    this.stopFollow();
    this.camera.rotate(dir);
    this.syncWallMode();
  }

  setZoomLevel(level: SimsZoomLevel) {
    this.stopFollow();
    this.camera.setZoomLevel(level);
  }

  focusZone(zoneId: ZoneId) {
    this.stopFollow();
    this.camera.focusZone(zoneId);
  }

  focusGeneral() {
    this.stopFollow();
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

  /** Proyecta un punto del mundo a coordenadas de pantalla (para etiquetas). */
  projectToScreen(x: number, z: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, 1.6, z).project(this.camera.camera);
    if (v.z > 1 || v.z < -1) return null;
    const w = this.renderer.domElement.clientWidth || 1;
    const h = this.renderer.domElement.clientHeight || 1;
    return { x: (v.x + 1) * 0.5 * w, y: (-v.y + 1) * 0.5 * h };
  }

  getLastState(): SimState | null {
    return this.simStateRef;
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
    this.stopFollow();
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
    const entity = this.pickEntities(e.clientX, e.clientY);
    if (entity) {
      if (this.hoverEntityId !== entity.id) {
        this.hoverEntityId = entity.id;

        this.callbacks.onHoverEntity?.(entity.kind, entity.id);
      }
      return;
    }
    if (this.hoverEntityId) {
      this.hoverEntityId = null;

      this.callbacks.onHoverEntity?.('machine', '');
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
      const entity = this.pickEntities(e.clientX, e.clientY);
      if (entity) {
        this.callbacks.onSelectEntity?.(entity.kind, entity.id);
      } else {
        const stock = this.pickStock(e.clientX, e.clientY);
        if (stock) {
          this.callbacks.onSelectStock?.(stock);
        } else {
          const hits = this.pickZones(e.clientX, e.clientY);
          const zoneId = (hits[0]?.object.userData.zoneId as ZoneId | undefined) ?? null;
          this.callbacks.onSelect?.(zoneId);
        }
      }
    }
    this.dragState = null;
  };

  private onPointerLeave = () => {
    this.dragState = null;
    if (this.hoverZoneId) {
      this.hoverZoneId = null;
      this.callbacks.onHoverZone?.(null);
    }
    if (this.hoverEntityId) {
      this.hoverEntityId = null;

      this.callbacks.onHoverEntity?.('machine', '');
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.stopFollow();
    this.camera.wheel(e.deltaY);
  };

  private onDblClick = () => {
    this.stopFollow();
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
  /** Sincroniza máquinas, camiones y palets dinámicos con la simulación. */
  syncSimulation(state: SimState, dt: number) {
    this.simStateRef = state;
    if (!this.entitySync) {
      this.entitySync = new EntitySync(this.layout, this.machinesGroup, this.trucksGroup, this.racksModel);
      for (const mesh of this.entitySync.meshes) this.scene.add(mesh);
    }
    this.entitySync.sync(state, dt);
  }

  /** Capas de localización (rastro y mapa de calor). */
  updateRtls(now: number, tracks: Map<string, SmoothedTrack>) {
    if (!this.rtlsLayers) {
      this.rtlsLayers = new RtlsLayers(this.layout);
      this.scene.add(this.rtlsLayers.group);
    }
    this.rtlsLayers.accumulate(tracks);
    this.rtlsLayers.update(now, tracks);
  }

  setRtlsLayer(kind: 'heatmap' | 'trails', visible: boolean) {
    if (!this.rtlsLayers) return;
    if (kind === 'heatmap') this.rtlsLayers.setVisibleHeatmap(visible);
    else this.rtlsLayers.setVisibleTrails(visible);
  }

  /** Sigue a una entidad con la cámara; `null` la suelta. */
  followEntity(id: string | null) {
    this.camera.followEntity(id);
  }

  private stopFollow() {
    if (this.camera.followId !== null) this.camera.followEntity(null);
  }

  private pickEntities(clientX: number, clientY: number): { kind: 'machine' | 'truck'; id: string } | null {
    this.raycaster.setFromCamera(this.toNdc(clientX, clientY), this.camera.camera);
    const targets: THREE.Object3D[] = [];
    for (const g of [this.machinesGroup, this.trucksGroup]) {
      if (g) g.traverse((o) => targets.push(o));
    }
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        const id = obj.userData.entityId as string | undefined;
        const kind = obj.userData.entityKind as 'machine' | 'truck' | undefined;
        if (id && kind) return { kind, id };
        obj = obj.parent;
      }
    }
    return null;
  }

  private pickStock(clientX: number, clientY: number): StockSelection | null {
    if (!this.racksModel) return null;
    this.raycaster.setFromCamera(this.toNdc(clientX, clientY), this.camera.camera);
    const paletHits = this.raycaster.intersectObject(this.racksModel.paletMesh, false);
    if (paletHits.length > 0 && paletHits[0].instanceId !== undefined) {
      const meta = this.racksModel.byIndex[paletHits[0].instanceId];
      if (meta) {
        return { locId: meta.locId, empty: false, sku: meta.sku, expiryDays: meta.expiryDays, x: meta.x, y: meta.y, z: meta.z };
      }
    }
    if (this.racksModel.emptyMesh.visible) {
      const emptyHits = this.raycaster.intersectObject(this.racksModel.emptyMesh, false);
      if (emptyHits.length > 0 && emptyHits[0].instanceId !== undefined) {
        const locId = this.racksModel.emptyIndex[emptyHits[0].instanceId];
        const p = this.slotPos.get(locId);
        if (locId && p) return { locId, empty: true, x: p.x, y: p.y, z: p.z };
      }
    }
    return null;
  }

  /** Cambia el modo de color de los palets y muestra huecos vacíos si procede. */
  setStockColorMode(mode: StockColorMode) {
    const model = this.racksModel;
    if (!model) return;
    const color = new THREE.Color();
    for (let i = 0; i < model.byIndex.length; i++) {
      const meta = model.byIndex[i];
      const article = articleForSku(meta.sku);
      color.setHex(colorForStock(mode, meta.sku, meta.temp, meta.expiryDays, article));
      model.paletMesh.setColorAt(i, color);
    }
    if (model.paletMesh.instanceColor) model.paletMesh.instanceColor.needsUpdate = true;
    model.emptyMesh.visible = mode === 'empty';
  }

  /** Posición de una ubicación (para el buscador). */
  slotPoint(locId: string): { x: number; y: number; z: number } | null {
    return this.slotPos.get(locId) ?? null;
  }

  /** Enfoca una ubicación con la cámara y la resalta. */
  focusLocation(locId: string, zoom: boolean = true) {
    const p = this.slotPos.get(locId);
    if (!p) return false;
    this.stopFollow();
    this.camera.focusOn({ x: p.x, z: p.z }, zoom ? 1 : undefined);
    if (this.highlight) {
      this.highlight.position.set(p.x, 2.5, p.z);
      this.highlight.visible = true;
      this.highlightUntil = performance.now() + 8000;
    }
    return true;
  }

  /** Información de una ubicación concreta (ocupada en la capa estática o vacía). */
  stockSelection(locId: string): StockSelection | null {
    const p = this.slotPos.get(locId);
    if (!p) return null;
    const meta = this.racksModel?.byIndex.find((m) => m.locId === locId);
    if (meta) return { locId, empty: false, sku: meta.sku, expiryDays: meta.expiryDays, x: meta.x, y: meta.y, z: meta.z };
    return { locId, empty: true, x: p.x, y: p.y, z: p.z };
  }

  /** Ubicaciones que contienen un SKU (para el buscador). */
  getSkuLocations(sku: string): { locId: string; x: number; z: number }[] {
    const out: { locId: string; x: number; z: number }[] = [];
    if (!this.racksModel) return out;
    for (const meta of this.racksModel.byIndex) {
      if (meta.sku === sku) out.push({ locId: meta.locId, x: meta.x, z: meta.z });
    }
    return out;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.camera.update(dt);
    updateWalls(this.walls, dt);

    // Seguimiento de entidad con la cámara.
    const followId = this.camera.followId;
    if (followId && this.simStateRef) {
      const entity =
        this.simStateRef.machines.find((mc) => mc.id === followId) ??
        this.simStateRef.trucks.find((t) => t.id === followId);
      if (entity) {
        this.camera.setFollowPosition(entity.pos.x, entity.pos.z);
      }
    }

    // Apaga el resaltado de stock al cabo de unos segundos.
    if (this.highlight && this.highlight.visible && performance.now() > this.highlightUntil) {
      this.highlight.visible = false;
    }

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
    this.rtlsLayers?.dispose();
  }
}
