import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import { forEachRackSlot } from '@/lib/layout/pinto-layout';
import { consolidationSlotPos } from '@/lib/sim/consolidation';
import type { MachineKind, SimState, Truck } from '@/lib/sim/types';
import { PALLET_HEIGHT } from '@/lib/sim/types';
import { createErE225i, createOrderPicker, createPalletTruck, createReachTruck, createTruck } from '@/three/builders/models';
import type { RacksModel } from '@/three/builders/build-racks';
import { DOCK_EDGE_Z, NAVE_FLOOR_H } from '@/three/builders/build-building';
import { LANE_DEPTH, dockPoint, faceNormal } from '@/lib/layout/dock-geometry';
import { PalletBatch, buildBandGeometries } from '@/three/builders/pallets';
import { newKin, shortestAngle, stepKin, type Kin, type KinOpts } from '@/three/motion';
import {
  CARRY_LIFT,
  FORK_REST,
  MAX_ON_FORKS,
  PALLET_LEN,
  TRAILER_COLS,
  TRAILER_ROWS,
  planHandling,
  poseAt,
  stopPalletPose,
  trailerPalletPose,
  type HandlingMachine,
  type HandlingPlan,
  type PalletPose,
  type Stop,
} from '@/lib/sim/handling';
import { StrapperRig } from '@/three/strapper-anim';
import { PartInstancer } from '@/three/part-instancer';
import { articleForSku } from '@/lib/stock/catalog';
import { colorForStock } from '@/lib/stock/colors';

/** Sube al GPU solo el rango de instancias modificado en este fotograma. */
function uploadRange(mesh: THREE.InstancedMesh, range: { min: number; max: number }) {
  if (range.max < 0) return;
  const attr = mesh.instanceMatrix;
  attr.clearUpdateRanges();
  attr.addUpdateRange(range.min * 16, (range.max - range.min + 1) * 16);
  attr.needsUpdate = true;
}

type ModelRef = {
  group: THREE.Group;
  route?: THREE.Line;
  forks?: THREE.Object3D;
  kind?: MachineKind;
  /** Centros (z local de las horquillas) de los palés del tándem. */
  slots: number[];
  /** Retráctil: carro del mástil y su posición recogida. */
  reach?: THREE.Object3D;
  reachBase: number;
  setLift?: (lift: number) => void;
  /** Elevación y avance dibujados (suavizados). */
  lift: number;
  ext: number;
  /** Plan de la maniobra en curso (se recalcula si cambia la parada). */
  plan?: { stop: Stop; plan: HandlingPlan };
  /** El palé de la maniobra ya ha cambiado de manos. */
  transferred: boolean;
  /** Camión: hojas de las puertas traseras y su apertura (0 cerradas … 1 abiertas). */
  doorLeaves?: THREE.Object3D[];
  door: number;
  /** Cinemática suavizada de la pose dibujada (posición, rumbo y velocidad). */
  kin?: Kin;
  /** Piezas móviles: ruedas (giran con la distancia), operario. */
  wheels?: THREE.Object3D[];
  wheelRadius?: number;
  operator?: THREE.Object3D;
  /** Tronco del operario de pie: se inclina desde la cadera. */
  operatorTorso?: THREE.Object3D;
  /** Fase de balanceo del operario. */
  swayPhase?: number;
  /** Inclinación suavizada del operario al cargar (0 = erguido). */
  lean?: number;
  /** Giro suavizado del operario (rad): recogepedidos que circulan con las horquillas detrás miran hacia donde van. */
  yawOp?: number;
  /** Inclinación suavizada del mástil (rad). */
  tilt?: number;
};

/** Radio de la rueda de las máquinas y de los camiones (para el giro según la distancia). */
const MACHINE_WHEEL_R = 0.13;
const TRUCK_WHEEL_R = 0.4;
/** Límites de movimiento de las máquinas (presentación). */
const MACHINE_KIN: KinOpts = { maxSpeed: 3.0, accel: 2.0, turnRate: 3.6, frontAxis: 'pz', snapDist: 12 };
/** Suavizado de la pose del camión: solo oculta el paso fijo de 0,1 s de la simulación (constante de tiempo, s). */
const TRUCK_SMOOTH_TAU = 0.05;
/** Distancia a partir de la cual la pose del camión se recoloca de golpe (salto de simulación a alta velocidad). */
const TRUCK_SNAP_DIST = 6;
/** Velocidad de convergencia de la inclinación del operario (1/s). */
const SMOOTH_RATE = 6;
/** Inclinación máxima del tronco del operario de pie (rad, desde la cadera) hacia delante y hacia atrás: no sale de la plataforma. */
const TORSO_BEND_MAX = 0.1;
const TORSO_BACK_MAX = 0.05;
/** Constante de tiempo del suavizado de elevación y avance de las horquillas (s): oculta el paso de 0,1 s de la simulación. */
const FORK_TAU = 0.07;
/** Inclinación del mástil (rad): con carga, hacia atrás (puntas arriba); al dejar el palé, hacia delante (puntas abajo). */
const TILT_CARRY = -0.05;
const TILT_PLACE = 0.06;
/** Apertura de las hojas de las puertas del remolque (rad) y constante de tiempo (s). */
const DOOR_OPEN = 4.6;
const DOOR_TAU = 0.45;

/** Altura de una capa al apilar palés en el suelo. */
const LAYER_H = 1.35;
/** Cota del piso donde apoyan los palés (nave y caja de los semirremolques están a la misma cota). */
const FLOOR_BASE = NAVE_FLOOR_H;
/** Cota de la cara superior de los rodillos de la flejadora. */
const BELT_TOP = NAVE_FLOOR_H + 0.62;
/** Capacidad de instancias de palés dinámicos (playas de expedición, recepción, camiones y máquinas). */
const DYNAMIC_PALET_CAP = 1500;
/** Filas de palés en una calle de pre-carga (la calle mide ~22 m). */
const LANE_ROWS = 12;
/** Capas apiladas máximas en el suelo; con más palés, el exceso no se dibuja (la simulación sí lo cuenta). */
const MAX_FLOOR_LAYERS = 3;
/** Puntos máximos de una ruta dibujada. */
const ROUTE_MAX_POINTS = 120;
/** Color de la ruta por tipo de máquina. */
const ROUTE_COLOR: Record<string, number> = { retractil: 0x22a6e0, frontal: 0xf39200, recogepedidos: 0x2ecc71, transpaleta: 0xb07cff };

/** Palés en fila única sobre la flejadora: paso entre centros y huecos en la cinta. */
const BELT_PITCH = 1.3;
/** Distancia del arco al primer palé de espera. */
const BELT_GAP = 2.0;
/** Palés que se dibujan en cada fila de entrada o de salida. */
const BELT_SLOTS = 8;
/** Velocidad de deslizamiento de un palé que se recoloca (m/s), giro (rad/s) y salto máximo que se desliza (m). */
const GLIDE_SPEED = 1.1;
const GLIDE_ROT = 3.2;
const GLIDE_MAX = 4;
const BELT_GLIDE_MAX = 26;
/** Tiempo que tarda un palé en pasar del suelo/rack a quedar fijo en las horquillas (s). */
const ATTACH_TIME = 0.3;

const CARTON = new THREE.Color(0xd8b580);
const STRAP_BAND = 0x243242;

/** Pose de un palé tal como se dibujó el fotograma anterior (para deslizar los cambios de sitio). */
interface Shown {
  x: number;
  y: number;
  z: number;
  rot: number;
  frame: number;
  rigid: boolean;
  blend: number;
}

type PlaceMode = 'home' | 'rigid' | 'belt' | 'direct';

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const segment = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/**
 * Giro mínimo entre dos orientaciones de un palé. Su figura es simétrica cada media vuelta (π), así que basta con
 * el ángulo dentro de ±π/2: al dejar un palé sobre el suelo o el remolque, su pose objetivo es la misma figura
 * girada 180° respecto a como iba en las horquillas, y sin esto daba una vuelta sobre sí misma al soltarlo.
 */
const palletTurn = (from: number, to: number) => {
  let d = (to - from) % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  else if (d < -Math.PI / 2) d += Math.PI;
  return d;
};

export class EntitySync {
  private machines = new Map<string, ModelRef>();
  private trucks = new Map<string, ModelRef>();
  /** Palés dinámicos: base de madera + carga; los flejes se dibujan aparte solo en los palés flejados. */
  private dyn: PalletBatch;
  private bands: THREE.InstancedMesh[];
  private bandOverride = new Map<string, [number, number, number]>();
  private unstrapped = new Set<string>();
  private colors = new Map<string, number>();
  private scratchVec = new THREE.Vector3();
  private mat = new THREE.Matrix4();
  private mat2 = new THREE.Matrix4();
  /** Siguiente instancia libre de la malla de palés dinámicos (se recalcula en cada sincronización). */
  private dynamicIdx = 0;
  private lastDynamicIdx = 0;
  /** Palés ya colocados en este fotograma: evita dibujar un mismo palé dos veces. */
  private drawn = new Set<string>();
  private shown = new Map<string, Shown>();
  private frame = 0;
  private dt = 1 / 60;
  private speedScale = 1;
  private layout: WarehouseLayout;
  private rigs = new Map<string, StrapperRig>();

  // Palés de rack: el palé inicial de cada hueco vive en `staticMesh` (creado por buildRacks).
  // Cuando un hueco cambia, ese palé estático se oculta y el hueco lo dibuja `slotBatch`.
  private rackBatch: PalletBatch | null;
  private staticMesh: THREE.InstancedMesh | null;
  private staticIndex = new Map<string, number>();
  private slotBatch: PalletBatch;
  private slotIndex = new Map<string, number>();
  private slotPos = new Map<string, { x: number; y: number; z: number }>();
  private zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  private hiddenStatic = new Set<number>();
  private slotRange = { min: Infinity, max: -1 };
  private staticRange = { min: Infinity, max: -1 };
  private consolidationLanes = new Map<string, import('@/lib/layout/types').ConsolidationLane>();
  /** Camiones atracados (posición y rumbo): dentro de su remolque el piso está a la cota de la caja (1,2 m). */
  private beds: { x: number; z: number; h: number }[] = [];

  constructor(
    layout: WarehouseLayout,
    machinesGroup: THREE.Group,
    trucksGroup: THREE.Group,
    racks: RacksModel | null,
    strapperGroups: Map<string, THREE.Group> = new Map(),
  ) {
    this.layout = layout;
    for (const a of layout.consolidation) {
      for (const l of a.lanes) this.consolidationLanes.set(l.id, l);
    }
    this.machineLayer = machinesGroup;
    this.truckLayer = trucksGroup;

    this.dyn = new PalletBatch(DYNAMIC_PALET_CAP, { lod: 'lo', usage: THREE.DynamicDrawUsage });
    const geos = buildBandGeometries();
    const bandMat = new THREE.MeshLambertMaterial({ color: STRAP_BAND });
    this.bands = [geos.a, geos.b, geos.c].map((g) => {
      const mesh = new THREE.InstancedMesh(g, bandMat, DYNAMIC_PALET_CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      return mesh;
    });
    for (let i = 0; i < DYNAMIC_PALET_CAP; i++) {
      this.dyn.hide(i);
      this.dyn.load.setColorAt(i, CARTON);
      for (const b of this.bands) b.setMatrixAt(i, this.zeroMatrix);
    }
    this.dyn.update();
    for (const b of this.bands) b.instanceMatrix.needsUpdate = true;

    // Capacidad para todas las ubicaciones de rack; cada hueco recibe su instancia la primera vez que cambia
    // (`slotIndex`) y solo se dibujan las asignadas (`count`), no las 20.000 ocultas.
    let n = 0;
    forEachRackSlot(layout, (slot) => {
      n++;
      // Cota relativa al piso de la nave, igual que los palés estáticos del rack (el grupo de racks ya la desplaza).
      this.slotPos.set(slot.locationId, { x: slot.x, y: slot.y, z: slot.z });
    });
    this.slotBatch = new PalletBatch(n, { lod: 'lo', usage: THREE.DynamicDrawUsage });
    this.slotBatch.base.name = 'slot-pallets-base';
    this.slotBatch.load.name = 'slot-pallets';
    for (let i = 0; i < n; i++) {
      this.slotBatch.hide(i);
      this.slotBatch.load.setColorAt(i, CARTON);
    }
    this.slotBatch.update();
    this.slotBatch.setCount(0);

    if (racks) {
      this.rackBatch = racks.palletBatch;
      this.staticMesh = racks.paletMesh;
      racks.byIndex.forEach((meta, i) => this.staticIndex.set(meta.locId, i));
      // Palés de huecos dentro del grupo de racks: bajan y suben con la estructura en los modos de muros (recorte y bajados).
      racks.group.add(this.slotBatch.base, this.slotBatch.load);
    } else {
      this.rackBatch = null;
      this.staticMesh = null;
      // Sin racks no hay grupo que los sostenga: se dibujan directamente a la cota del piso.
      for (const mesh of this.slotBatch.meshes) mesh.position.y = NAVE_FLOOR_H;
    }

    // Aparejo de animación de cada flejadora (fleje, baliza y cinta), colgado de su grupo.
    for (const st of layout.strappers) {
      const group = strapperGroups.get(st.id);
      if (!group) continue;
      const flow = Math.sign(st.output.x - st.input.x) || 1;
      this.rigs.set(st.id, new StrapperRig(group, st.rect.xMax - st.rect.xMin, flow));
    }
  }

  private routeGroup = new THREE.Group();
  private machineLayer: THREE.Group;
  private truckLayer: THREE.Group;
  /** Dibujo instanciado de máquinas y camiones (las piezas fijas de cada nodo móvil, fusionadas). */
  readonly instancer = new PartInstancer('vehicle-instances');

  /** Escribe las matrices de los vehículos visibles; se llama justo antes de dibujar. */
  updateInstances() {
    this.instancer.update([this.machineLayer, this.truckLayer]);
  }

  private getMachine(id: string, kind: string): ModelRef {
    let ref = this.machines.get(id);
    if (ref) return ref;
    // 'frontal' es el identificador interno de la ERE 225i (apilador Jungheinrich).
    const created =
      kind === 'retractil'
        ? createReachTruck()
        : kind === 'frontal'
          ? createErE225i()
          : kind === 'transpaleta'
            ? createPalletTruck()
            : createOrderPicker();
    created.group.userData.entityId = id;
    created.group.userData.entityKind = 'machine';
    const n = created.nodes;
    this.instancer.bake(created.group, [n.forks, n.mast, n.reach, n.operator, n.operatorTorso, ...n.wheels, ...(n.moving ?? [])]);
    ref = {
      group: created.group,
      forks: created.nodes.forks,
      kind: kind as MachineKind,
      slots: created.nodes.slots,
      reach: created.nodes.reach,
      reachBase: created.nodes.reachBase ?? 0,
      setLift: created.nodes.setLift,
      lift: 0,
      ext: 0,
      transferred: false,
      door: 0,
      wheels: created.nodes.wheels,
      wheelRadius: MACHINE_WHEEL_R,
      kin: undefined,
      swayPhase: 0,
      lean: 0,
    };
    if (created.nodes.operator) ref.operator = created.nodes.operator;
    if (created.nodes.operatorTorso) ref.operatorTorso = created.nodes.operatorTorso;
    this.machineLayer.add(created.group);
    this.machines.set(id, ref);
    return ref;
  }

  private getTruck(id: string, reefer: boolean): ModelRef {
    let ref = this.trucks.get(id);
    if (ref) return ref;
    const t = createTruck({ reefer });
    t.group.userData.entityId = id;
    t.group.userData.entityKind = 'truck';
    this.instancer.bake(t.group, [...t.nodes.doorLeaves, ...t.nodes.wheels]);
    ref = {
      group: t.group,
      slots: [],
      reachBase: 0,
      lift: 0,
      ext: 0,
      transferred: false,
      doorLeaves: t.nodes.doorLeaves,
      door: -1,
      wheels: t.nodes.wheels,
      wheelRadius: TRUCK_WHEEL_R,
    };
    this.truckLayer.add(t.group);
    this.trucks.set(id, ref);
    return ref;
  }

  /** Dibuja el trayecto pendiente de la máquina (posición actual + puntos de la ruta). */
  private updateRoute(ref: ModelRef, m: { id: string; kind: string; pos: { x: number; z: number }; route: { x: number; z: number }[] }) {
    if (!ref.route) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ROUTE_MAX_POINTS * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color: ROUTE_COLOR[m.kind] ?? 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
      ref.route = new THREE.Line(geo, mat);
      ref.route.frustumCulled = false;
      ref.route.renderOrder = 2;
      this.routeGroup.add(ref.route);
    }
    const pos = ref.route.geometry.getAttribute('position') as THREE.BufferAttribute;
    const pts = [m.pos, ...m.route].slice(0, ROUTE_MAX_POINTS);
    if (m.route.length === 0) {
      ref.route.visible = false;
      return;
    }
    ref.route.visible = true;
    pts.forEach((p, i) => pos.setXYZ(i, p.x, 0.3, p.z));
    pos.needsUpdate = true;
    ref.route.geometry.setDrawRange(0, pts.length);
  }

  /** Altura (m) de un palé dibujado: la suya, acotada. */
  private heightOf(state: SimState, pid: string): number {
    const h = state.paletById[pid]?.height ?? PALLET_HEIGHT;
    return h;
  }

  /** Color de la carga (ocupación por temperatura, como los palés del rack). */
  private colorOf(state: SimState, pid: string): THREE.Color {
    let hex = this.colors.get(pid);
    if (hex === undefined) {
      const p = state.paletById[pid];
      hex = p ? colorForStock('occupancy', p.sku, p.temp, p.daysToExpiry, articleForSku(p.sku)) : CARTON.getHex();
      this.colors.set(pid, hex);
    }
    return this.scratchColor.setHex(hex);
  }
  private scratchColor = new THREE.Color();

  /** ¿Lleva flejes el palé? Sí si ya salió de la preparación y no está esperando o pasando por la flejadora. */
  private isStrapped(state: SimState, pid: string): boolean {
    const p = state.paletById[pid];
    if (!p || this.unstrapped.has(pid)) return false;
    return p.state === 'prepared' || p.state === 'loaded' || p.state === 'shipped';
  }

  /**
   * Dibuja un palé (si existe y no está ya dibujado) en la malla dinámica. `y` es la cota de su cara inferior.
   * - home: un palé que cambia de sitio se desliza al nuevo (no salta).
   * - rigid: sobre unas horquillas; al engancharse se funde con la pose anterior en `ATTACH_TIME`.
   * - belt: igual que home, pero con la cota que marca la cinta en cada punto.
   * - direct: sin suavizado.
   */
  private placePalet(state: SimState, pid: string, x: number, y: number, z: number, rot: number, mode: PlaceMode = 'home', yAt?: (x: number) => number): boolean {
    if (this.drawn.has(pid) || !state.paletById[pid] || this.dynamicIdx >= DYNAMIC_PALET_CAP) return false;
    this.drawn.add(pid);
    let sx = x;
    let sy = y;
    let sz = z;
    let sr = rot;
    let blend = 0;
    const prev = this.shown.get(pid);
    if (prev && prev.frame >= this.frame - 1 && mode !== 'direct') {
      const d = Math.hypot(prev.x - x, prev.z - z);
      const dy = Math.abs(prev.y - y);
      if (mode === 'rigid') {
        blend = prev.rigid ? 1 : Math.min(1, prev.blend + this.dt / ATTACH_TIME);
        if (blend < 1 && d + dy < GLIDE_MAX) {
          const k = smooth(blend);
          sx = prev.x + (x - prev.x) * k;
          sy = prev.y + (y - prev.y) * k;
          sz = prev.z + (z - prev.z) * k;
          sr = prev.rot + palletTurn(prev.rot, rot) * k;
        }
      } else if (d < (mode === 'belt' ? BELT_GLIDE_MAX : GLIDE_MAX) && d + dy > 0.002) {
        const step = GLIDE_SPEED * this.speedScale * this.dt;
        const f = d > step ? step / d : 1;
        sx = prev.x + (x - prev.x) * f;
        sz = prev.z + (z - prev.z) * f;
        sy = yAt ? yAt(sx) : prev.y + Math.max(-step, Math.min(step, y - prev.y));
        sr = prev.rot + Math.max(-GLIDE_ROT * this.dt, Math.min(GLIDE_ROT * this.dt, palletTurn(prev.rot, rot)));
      }
    } else if (yAt) {
      sy = yAt(x);
    }
    this.shown.set(pid, { x: sx, y: sy, z: sz, rot: sr, frame: this.frame, rigid: mode === 'rigid', blend });

    const i = this.dynamicIdx++;
    this.dyn.set(i, sx, sy, sz, sr, this.heightOf(state, pid));
    this.dyn.load.setColorAt(i, this.colorOf(state, pid));
    const bs = this.bandOverride.get(pid) ?? (this.isStrapped(state, pid) ? ([1, 1, 1] as [number, number, number]) : ([0, 0, 0] as [number, number, number]));
    this.dyn.loadMatrixAt(i, this.mat);
    for (let b = 0; b < 3; b++) {
      if (bs[b] > 0.001) {
        this.mat2.copy(this.mat).scale(this.scratchVec.set(bs[b], bs[b], bs[b]));
        this.bands[b].setMatrixAt(i, this.mat2);
      } else {
        this.bands[b].setMatrixAt(i, this.zeroMatrix);
      }
    }
    return true;
  }

  private placeAt(state: SimState, pid: string, pose: PalletPose, mode: PlaceMode = 'home') {
    this.placePalet(state, pid, pose.x, FLOOR_BASE + pose.y, pose.z, pose.rotY, mode);
  }

  /** Muestra u oculta el palé de un hueco según lo que contenga y si está siendo transportado. */
  private updateRackSlot(loc: string, state: SimState, away: Set<string>) {
    const occupiedBy = state.rackOccupancy[loc];
    const visible = occupiedBy !== undefined && !away.has(occupiedBy);

    // El palé inicial del hueco deja de mostrarse en cuanto el hueco cambia.
    const si = this.staticIndex.get(loc);
    if (si !== undefined && this.staticMesh && !this.hiddenStatic.has(si)) {
      this.hiddenStatic.add(si);
      this.rackBatch?.hide(si);
      this.staticRange.min = Math.min(this.staticRange.min, si);
      this.staticRange.max = Math.max(this.staticRange.max, si);
    }

    const pos = this.slotPos.get(loc);
    if (!pos) return;
    let di = this.slotIndex.get(loc);
    if (di === undefined) {
      di = this.slotIndex.size;
      this.slotIndex.set(loc, di);
      this.slotBatch.setCount(di + 1);
    }
    this.slotRange.min = Math.min(this.slotRange.min, di);
    this.slotRange.max = Math.max(this.slotRange.max, di);
    if (visible) {
      this.slotBatch.set(di, pos.x, pos.y, pos.z, 0, this.heightOf(state, occupiedBy), this.colorOf(state, occupiedBy));
    } else {
      this.slotBatch.hide(di);
    }
  }

  /** Altura del piso bajo una máquina: el piso de la nave (1,2 m) dentro de la nave o de su anexa, el patio fuera. */
  private floorY(x: number, z: number): number {
    const { rect, annex } = this.layout.building;
    // La niveladora (z hasta DOCK_EDGE_Z) está a cota de nave: la máquina sube a ella sin caer al patio.
    const inside = x > rect.xMin && x < rect.xMax && z > rect.zMin && z < DOCK_EDGE_Z;
    // La sala anexa está a la misma cota de piso que la nave (no a nivel de calle).
    const inAnnex = annex !== undefined && x > annex.xMin && x < annex.xMax && z > annex.zMin && z < annex.zMax;
    if (inside || inAnnex || this.inBed(x, z)) return NAVE_FLOOR_H;
    return 0;
  }

  /** ¿Está (x, z) dentro de la caja de algún remolque atracado? Coordenadas locales del remolque (x ±1,25; z −1,96…11,6). */
  private inBed(x: number, z: number): boolean {
    for (const b of this.beds) {
      const dx = x - b.x;
      const dz = z - b.z;
      // Rotación inversa del rumbo (three.js: rotación Y).
      const lx = dx * Math.cos(b.h) - dz * Math.sin(b.h);
      const lz = dx * Math.sin(b.h) + dz * Math.cos(b.h);
      if (Math.abs(lx) < 1.25 && lz > -1.96 && lz < 11.6) return true;
    }
    return false;
  }

  /**
   * Rumbo objetivo para la pose dibujada de la máquina:
   * - En maniobra de manipulación (coger/dejar): horquillas encaradas al hueco/palé/camión (stop.face).
   * - En trabajo estático: rumbo fijado (m.heading).
   * - Aparcada o en carga en la sala de máquinas: orientación del puesto asignado.
   * - En reposo/idle sin puesto: conserva la orientación suave que ya tenía.
   * - En tránsito/traslado y en espera en pasillo (traveling / waiting): conducción realista de almacén "de espaldas" /
   *   con las horquillas detrás (tracción/chasis por delante en el sentido de la marcha, palas detrás con o sin carga).
   */
  private machineTargetHeading(ref: ModelRef, m: HandlingMachine): number {
    const h = m.handling;
    if (h) return h.stop.face;
    if (m.status === 'working') return m.heading;
    if (m.status === 'charging' || (m.status === 'idle' && m.spot)) return m.heading;
    if (m.status === 'idle') return ref.kin?.heading ?? (m.heading + Math.PI);
    return m.heading + Math.PI;
  }

  /** Pose dibujada de una máquina: giro en arco, aceleración suave, ruedas, horquillas y operario (presentación). */
  private animateMachine(ref: ModelRef, m: HandlingMachine, shift: number, dt: number) {
    const tx = m.pos.x;
    const tz = m.pos.z + shift;
    const targetHeading = this.machineTargetHeading(ref, m);
    if (!ref.kin) ref.kin = newKin(tx, tz, targetHeading);
    const k = ref.kin;
    const dist = stepKin(k, tx, tz, { mode: 'fixed', h: targetHeading }, dt, MACHINE_KIN);

    // Horquillas y mástil: siguen la línea de tiempo de la maniobra (o el estado de reposo).
    const h = m.handling;
    let tLift: number;
    let tExt = 0;
    if (h) {
      if (ref.plan?.stop !== h.stop) ref.plan = { stop: h.stop, plan: planHandling(m.kind, h.stop, h.laden) };
      const pose = poseAt(ref.plan.plan, h.elapsed);
      tLift = pose.lift;
      tExt = pose.ext;
      ref.transferred = pose.transferred;
    } else {
      ref.plan = undefined;
      ref.transferred = false;
      // Sin maniobras (simulación antigua) la elevación es la de la simulación.
      tLift = m.stops === undefined ? m.liftHeight : m.carriedPalets.length > 0 ? CARRY_LIFT : 0;
    }
    const f = 1 - Math.exp(-dt / FORK_TAU);
    const prevExt = ref.ext;
    ref.lift += (tLift - ref.lift) * f;
    ref.ext += (tExt - ref.ext) * f;
    // Mástil: con carga va inclinado hacia atrás; al dejar el palé, hacia delante hasta que el palé cambia de manos.
    let tTilt = m.carriedPalets.length > 0 ? TILT_CARRY : 0;
    if (h && h.stop.kind === 'put' && !ref.transferred) tTilt = TILT_PLACE;
    ref.tilt = (ref.tilt ?? 0) + (tTilt - (ref.tilt ?? 0)) * f;

    const retract = ref.reach !== undefined;
    const fy = this.floorY(k.x, k.z);
    // El resto de máquinas avanzan hasta el palé: se desplazan en su rumbo.
    const adv = retract ? 0 : ref.ext;
    ref.group.position.set(k.x + Math.sin(k.heading) * adv, fy, k.z + Math.cos(k.heading) * adv);
    ref.group.rotation.y = k.heading;
    if (ref.forks) {
      ref.forks.position.y = FORK_REST + ref.lift;
      ref.forks.rotation.x = ref.tilt ?? 0;
    }
    if (ref.reach) ref.reach.position.z = ref.reachBase + ref.ext;
    ref.setLift?.(ref.lift);
    if (ref.wheels) {
      for (const w of ref.wheels) {
        if (w.userData.isLoadRoller) w.position.y = -ref.lift;
      }
    }
    const travelDir = m.handling ? (ref.ext > prevExt ? 1 : -1) : -1;
    this.spinWheels(ref, (dist + (retract ? 0 : Math.abs(ref.ext - prevExt))) * travelDir);

    // Operario: balanceo al conducir e inclinación al llevar palés o maniobrar.
    if (ref.operator) {
      ref.swayPhase = (ref.swayPhase ?? 0) + (dist + Math.abs(ref.ext - prevExt)) * 5;
      const carrying = m.carriedPalets.length > 0 ? 0.22 : 0;
      ref.lean = (ref.lean ?? 0) + (carrying - (ref.lean ?? 0)) * (1 - Math.exp(-dt * SMOOTH_RATE));
      const speed = dist / Math.max(dt, 1e-6);
      ref.operator.rotation.z = Math.sin(ref.swayPhase) * Math.min(0.06, speed * 0.02);
      const lookUp = ref.kind === 'retractil' && ref.lift > 0.4 ? -Math.min(0.42, (ref.lift - 0.2) * 0.14) : 0;
      const advRate = (ref.ext - prevExt) / Math.max(dt, 1e-6);
      const brace = Math.max(-0.14, Math.min(0.14, advRate * 0.08));
      if (ref.operatorTorso) {
        // De pie en plataforma: se inclina desde la cadera, en el sentido en que mira, con un límite pequeño.
        ref.operatorTorso.rotation.x = Math.max(-TORSO_BACK_MAX, Math.min(TORSO_BEND_MAX, ref.lean + brace));
      } else {
        ref.operator.rotation.x = ref.kind === 'retractil' ? lookUp : ref.lean + brace;
      }
      // Recogepedidos: al circular con las horquillas detrás, el operario gira en la plataforma y mira hacia donde va.
      if (ref.kind === 'recogepedidos') {
        const travelling = !h && (m.status === 'traveling' || m.status === 'waiting');
        ref.yawOp = (ref.yawOp ?? 0) + shortestAngle((travelling ? Math.PI : 0) - (ref.yawOp ?? 0)) * (1 - Math.exp(-dt * SMOOTH_RATE));
        ref.operator.rotation.y = ref.yawOp;
      }
    }
  }

  /**
   * Pose dibujada de un camión: la de la simulación (posición y rumbo), con un suavizado muy leve que solo
   * oculta el paso fijo. Los camiones en la cola exterior (fuera de la parcela) no se dibujan.
   */
  private animateTruck(ref: ModelRef, t: Truck, dt: number) {
    const g = ref.group;
    g.visible = t.status !== 'offsite';
    if (!g.visible) return;
    if (ref.doorLeaves) {
      // Las hojas de las puertas traseras abren hasta pegarse a los laterales al atracar y cierran al salir.
      const target = t.status === 'at_dock' ? 1 : 0;
      ref.door = ref.door < 0 ? target : ref.door + (target - ref.door) * (1 - Math.exp(-dt / DOOR_TAU));
      for (const leaf of ref.doorLeaves) leaf.rotation.y = (leaf.userData.side as number) * DOOR_OPEN * smooth(clamp01(ref.door));
    }
    const dx = t.pos.x - g.position.x;
    const dz = t.pos.z - g.position.z;
    const far = Math.hypot(dx, dz) > TRUCK_SNAP_DIST || !ref.kin;
    const f = far ? 1 : 1 - Math.exp(-dt / TRUCK_SMOOTH_TAU);
    const prevX = g.position.x;
    const prevZ = g.position.z;
    g.position.set(prevX + dx * f, 0, prevZ + dz * f);
    g.rotation.y += shortestAngle(t.heading - g.rotation.y) * f;
    // `kin` solo marca que la pose ya se ha colocado una vez.
    if (!ref.kin) ref.kin = newKin(t.pos.x, t.pos.z, t.heading);
    if (!far) this.spinWheels(ref, Math.hypot(g.position.x - prevX, g.position.z - prevZ));
  }

  /** Giro de las ruedas según la distancia recorrida (eje de rueda = X local). */
  private spinWheels(ref: ModelRef, dist: number) {
    if (!ref.wheels || !ref.wheelRadius || dist <= 0) return;
    const turn = dist / ref.wheelRadius;
    for (const w of ref.wheels) w.rotation.x += turn;
  }

  /**
   * Dibuja los palés que lleva una máquina: sobre las horquillas (orientados a lo largo de ellas), los que acaba de
   * apoyar en el rack/suelo/remolque y que aún no figuran allí en la simulación. Devuelve los palés que han salido de
   * su sitio (para ocultar el hueco de origen).
   */
  private drawMachinePallets(state: SimState, m: HandlingMachine, ref: ModelRef, away: Set<string>) {
    const h = m.handling;
    const cap = MAX_ON_FORKS[m.kind];
    let onForks = m.carriedPalets.slice(0, cap);
    const released: { pid: string; pose: PalletPose }[] = [...(m.dropped ?? []).map((d) => ({ pid: d.paletId, pose: d.pose }))];
    if (h && ref.transferred) {
      const stopIds = h.stop.paletIds;
      if (h.stop.kind === 'take') {
        const onForksSet = new Set(onForks);
        for (const id of stopIds) {
          if (!onForksSet.has(id)) {
            onForks.push(id);
            onForksSet.add(id);
          }
        }
      } else {
        const stopIdsSet = new Set(stopIds);
        onForks = onForks.filter((id) => !stopIdsSet.has(id));
        stopIds.forEach((pid, k) => released.push({ pid, pose: stopPalletPose(h.stop, k) }));
      }
    }
    if (onForks.length > 0 && ref.forks) {
      ref.group.updateWorldMatrix(true, true);
      // Los palés van con el lado largo a lo largo de las horquillas, el primero junto al respaldo.
      const rot = ref.group.rotation.y + Math.PI / 2;
      onForks.forEach((pid, k) => {
        const slot = ref.slots[Math.min(k, ref.slots.length - 1)] ?? 0.65;
        const v = this.scratchVec.set(0, 0.06, slot);
        ref.forks!.localToWorld(v);
        this.placePalet(state, pid, v.x, v.y, v.z, rot, 'rigid');
        away.add(pid);
      });
    }
    for (const r of released) {
      this.placeAt(state, r.pid, r.pose, 'home');
      away.add(r.pid);
    }
  }

  /** Cota de la cinta de la flejadora en el punto x: rodillos a nivel constante (BELT_TOP) a lo largo de toda la vía. */
  private beltHeight(xMin: number, xMax: number) {
    return (x: number) => {
      if (x < xMin - 0.5 || x > xMax + 0.5) return FLOOR_BASE;
      return BELT_TOP;
    };
  }

  /**
   * Flejadoras: los palés esperan en fila única en la cinta de entrada, pasan de uno en uno bajo el arco (dos lazos
   * verticales y uno horizontal, con sellado) y salen por la cinta de salida, donde esperan a la transpaleta ESE.
   */
  private syncStrappers(state: SimState, away: Set<string>) {
    for (const st of state.strappers) {
      const station = this.layout.strappers.find((s) => s.id === st.id);
      if (!station) continue;
      const cx = (station.rect.xMin + station.rect.xMax) / 2;
      const cz = (station.rect.zMin + station.rect.zMax) / 2;
      const inSign = Math.sign(station.input.x - cx) || -1;
      const outSign = Math.sign(station.output.x - cx) || 1;
      const yAt = this.beltHeight(station.rect.xMin, station.rect.xMax);
      const belt = (pid: string, x: number, z: number) => this.placePalet(state, pid, x, yAt(x), z, 0, 'belt', yAt);

      // Lote en proceso: línea de tiempo del palé bajo el arco.
      const cur = st.current?.paletIds ?? [];
      const n = cur.length;
      const seconds = station.secondsPerPallet * Math.max(1, n);
      const u = st.current ? clamp01(1 - (st.current.doneAt - state.ts) / seconds) : 0;
      const active = Math.min(n - 1, Math.floor(u * n));
      const f = n > 0 ? u * n - active : 0;
      const waiting = Math.max(0, n - active - 1);
      let feed = 0;
      let tight = 0;
      let seal = 0;
      let moving = false;

      cur.forEach((pid, k) => {
        if (k < active) {
          // Ya flejado: espera en la cinta de salida a que termine el lote.
          this.bandOverride.set(pid, [1, 1, 1]);
          belt(pid, cx + outSign * (BELT_GAP + BELT_PITCH * (active - 1 - k)), cz);
          return;
        }
        if (k > active) {
          this.bandOverride.set(pid, [0, 0, 0]);
          belt(pid, cx + inSign * (BELT_GAP + BELT_PITCH * (k - active - 1)), cz);
          return;
        }
        // Palé bajo el arco: entra, recibe un lazo, avanza 0,6 m, recibe el segundo, el horizontal y sale.
        const x1 = cx + inSign * 0.3;
        const x2 = cx - inSign * 0.3;
        const waitX = cx + inSign * BELT_GAP;
        const outX = cx + outSign * BELT_GAP;
        let x: number;
        if (f < 0.12) x = waitX + (x1 - waitX) * smooth(segment(f, 0, 0.12));
        else if (f < 0.36) x = x1;
        else if (f < 0.44) x = x1 + (x2 - x1) * smooth(segment(f, 0.36, 0.44));
        else if (f < 0.72) x = x2;
        else x = x2 + (outX - x2) * smooth(segment(f, 0.72, 0.8));
        // El primer lazo cae en el lado del palé que mira a la salida; el segundo, en el otro.
        const first = inSign > 0 ? 0 : 1;
        const bands: [number, number, number] = [0, 0, 0];
        bands[first] = f >= 0.26 ? 1 + 0.12 * (1 - segment(f, 0.26, 0.31)) : 0;
        bands[1 - first] = f >= 0.58 ? 1 + 0.12 * (1 - segment(f, 0.58, 0.63)) : 0;
        bands[2] = f >= 0.68 ? 1 + 0.1 * (1 - segment(f, 0.68, 0.72)) : 0;
        if (f >= 0.12 && f < 0.36) {
          feed = segment(f, 0.12, 0.26);
          tight = segment(f, 0.26, 0.31);
          seal = f >= 0.31 ? segment(f, 0.31, 0.36) : 0;
        } else if (f >= 0.44 && f < 0.68) {
          feed = segment(f, 0.44, 0.58);
          tight = segment(f, 0.58, 0.63);
          seal = f >= 0.63 ? segment(f, 0.63, 0.68) : 0;
        }
        moving = f < 0.12 || (f >= 0.36 && f < 0.44) || f >= 0.72;
        this.bandOverride.set(pid, bands);
        this.placePalet(state, pid, x, yAt(x), cz, 0, 'direct');
      });

      // Cola de entrada: fila única hacia la entrada; el más antiguo, el más cerca del arco.
      const inIds: string[] = [];
      for (const entry of st.queue) inIds.push(...entry.paletIds);
      inIds.slice(0, BELT_SLOTS).forEach((pid, j) => {
        belt(pid, cx + inSign * (BELT_GAP + BELT_PITCH * (waiting + j)), cz);
      });

      // Salida: lotes flejados y pedidos de transferencias aún sin recoger; fila única sobre los rodillos de la cinta.
      const outIds: string[] = [];
      for (const task of state.tasks) {
        if (task.kind === 'transfer' && task.state !== 'done' && Math.hypot(task.from.x - station.output.x, task.from.z - station.output.z) < 0.1) {
          for (const pid of task.paletIds) if (!away.has(pid)) outIds.push(pid);
        }
      }
      for (const e of state.strapOut) if (e.strapperId === st.id) outIds.push(...e.paletIds);
      const exitBaseX = station.rect.xMax - 0.65;
      outIds.slice(0, BELT_SLOTS).forEach((pid, k) => {
        belt(pid, exitBaseX - outSign * PALLET_LEN * k, cz);
      });

      if (inIds.length + outIds.length > 0) moving = moving || state.running;
      this.rigs.get(st.id)?.update({ active: n > 0, feed, tight, seal, belt: n > 0 || inIds.length > 0 || moving }, this.dt);
    }
  }

  /** Posición de un palé en la fila `i` de una calle de pre-carga o de recepción: dos de frente, con el lado largo hacia el muelle. */
  private laneSpot(dockId: string, i: number): PalletPose | null {
    const dock = this.layout.docks.find((d) => d.id === dockId);
    if (!dock) return null;
    const col = i % 2;
    const row = Math.floor(i / 2) % LANE_ROWS;
    const layer = Math.floor(i / (2 * LANE_ROWS));
    if (layer >= MAX_FLOOR_LAYERS) return null;
    const n = faceNormal(dock.face);
    const spot = dockPoint(dock, (col - 0.5) * 0.95, LANE_DEPTH[dock.face].stage - row * 1.3);
    return { x: spot.x, y: layer * LAYER_H, z: spot.z, rotY: Math.atan2(n.x, n.z) - Math.PI / 2 };
  }

  /** Sincroniza máquinas, camiones, palets sueltos y huecos de rack con el snapshot de la simulación. */
  sync(state: SimState, dt = 1 / 60) {
    this.frame++;
    this.dt = Math.min(dt, 0.1);
    this.speedScale = state.running ? Math.max(1, state.speed || 1) : 1;

    // Camiones atracados: su caja da la cota de piso a las máquinas que entran en ella.
    this.beds = state.trucks.filter((t) => t.status === 'at_dock').map((t) => ({ x: t.pos.x, z: t.pos.z, h: t.heading }));

    // Máquinas: la horquilla sube o baja con su altura real.
    const machineIds = new Set(state.machines.map((m) => m.id));
    for (const [id, ref] of this.machines) {
      if (!machineIds.has(id)) {
        this.machineLayer.remove(ref.group);
        this.machines.delete(id);
      }
    }
    // Máquinas que comparten el mismo punto (p. ej. varios recogepedidos trabajando en un nodo):
    // se separan a lo largo del pasillo para que no se dibujen una encima de otra. Solo presentación.
    const sharing = new Map<string, number>();
    for (const m of state.machines) {
      const key = `${m.pos.x.toFixed(1)},${m.pos.z.toFixed(1)}`;
      const slot = sharing.get(key) ?? 0;
      sharing.set(key, slot + 1);
      const ref = this.getMachine(m.id, m.kind);
      const shift = slot * 1.1;
      this.animateMachine(ref, m as HandlingMachine, shift, dt);
      this.updateRoute(ref, m);
    }

    // Camiones
    const truckIds = new Set(state.trucks.map((t) => t.id));
    for (const [id, ref] of this.trucks) {
      if (!truckIds.has(id)) {
        this.truckLayer.remove(ref.group);
        this.trucks.delete(id);
      }
    }
    for (const t of state.trucks) {
      this.animateTruck(this.getTruck(t.id, t.temp !== 'dry'), t, dt);
    }

    // Cada palé se dibuja una sola vez: idx avanza por la malla dinámica y `drawn` evita repetirlos.
    this.dynamicIdx = 0;
    this.drawn.clear();
    this.bandOverride.clear();

    // Palés que aún no han pasado por la flejadora: la cola, el lote en proceso y las recogidas en curso.
    this.unstrapped.clear();
    for (const st of state.strappers) {
      for (const e of st.queue) for (const pid of e.paletIds) this.unstrapped.add(pid);
      for (const pid of st.current?.paletIds ?? []) this.unstrapped.add(pid);
    }
    for (const task of state.tasks) if (task.kind === 'pick' && task.state !== 'done') for (const pid of task.paletIds) this.unstrapped.add(pid);

    // Palés en máquinas: sobre las horquillas, con la altura real de la horquilla.
    const away = new Set<string>();
    for (const m of state.machines) {
      const ref = this.machines.get(m.id);
      if (ref) this.drawMachinePallets(state, m as HandlingMachine, ref, away);
    }

    // Flejadoras: entrada (cola), lote en proceso y salida.
    this.syncStrappers(state, away);

    // Calles de pre-carga (Expedición): palés preparados en el suelo listos para ser cargados en camiones
    for (const [dockId, ids] of Object.entries(state.lanePallets)) {
      ids.forEach((pid, i) => {
        const pose = this.laneSpot(dockId, i);
        if (pose) this.placeAt(state, pid, pose);
      });
    }

    // Playa de descarga y recepción (stagingQueue): palés descargados de camiones en espera de ubicación en rack (putaway)
    const stagingByDock: Record<string, string[]> = {};
    for (const pid of state.stagingQueue) {
      const p = state.paletById[pid];
      if (!p) continue;
      const dockId = p.dockId ?? (this.layout.docks.find((d) => d.kind === 'inbound' && Math.hypot(d.x - p.pos.x, d.z - p.pos.z) < 25)?.id ?? 'D01');
      if (!stagingByDock[dockId]) stagingByDock[dockId] = [];
      stagingByDock[dockId].push(pid);
    }
    for (const [dockId, ids] of Object.entries(stagingByDock)) {
      ids.forEach((pid, i) => {
        const pose = this.laneSpot(dockId, i);
        if (pose) this.placeAt(state, pid, pose);
      });
    }

    // Playa de consolidación: palés de seco ya flejados, en fila a lo largo de la calle reservada del muelle.
    for (const slot of Object.values(state.consolidation ?? {})) {
      const lane = this.consolidationLanes.get(slot.laneId);
      if (!lane) continue;
      const rotY = Math.atan2(lane.dirX, lane.dirZ) - Math.PI / 2;
      slot.paletIds.forEach((pid, k) => {
        const q = consolidationSlotPos(lane, k);
        this.placePalet(state, pid, q.x, FLOOR_BASE, q.z, rotY);
      });
    }

    // Palés en los semirremolques atracados en muelles: 33 europalés, 3 de frente y 11 filas, lado largo hacia delante.
    for (const t of state.trucks) {
      if (t.status !== 'at_dock' || !t.dockId || t.cargoPaletIds.length === 0) continue;
      t.cargoPaletIds.forEach((pid, i) => {
        if (i >= TRAILER_ROWS * TRAILER_COLS) return;
        this.placeAt(state, pid, trailerPalletPose(t, i));
      });
    }

    // Palés de una tarea encolada que aún no ha cogido ninguna máquina (salida de la calle hacia el muelle).
    for (const task of state.tasks) {
      if (task.state !== 'queued' || task.kind !== 'dock_shift') continue;
      task.paletIds.forEach((pid, i) => this.placePalet(state, pid, task.from.x + i * 1.3, FLOOR_BASE, task.from.z, 0));
    }

    // Palés que una máquina va a coger y que ya no figuran en ninguna lista (p. ej. recién sacados de la playa).
    for (const m of state.machines) {
      const hm = m as HandlingMachine;
      const stops = hm.handling && !this.machines.get(m.id)?.transferred ? [hm.handling.stop, ...(hm.stops ?? [])] : (hm.stops ?? []);
      for (const stop of stops) {
        if (stop.kind !== 'take' || stop.where === 'rack') continue;
        stop.paletIds.forEach((pid, k) => this.placeAt(state, pid, stopPalletPose(stop, k)));
      }
    }

    for (let i = this.dynamicIdx; i < this.lastDynamicIdx; i++) {
      this.dyn.hide(i);
      for (const b of this.bands) b.setMatrixAt(i, this.zeroMatrix);
    }
    // Solo se dibujan (y se suben a la GPU) las instancias ocupadas en este fotograma.
    const used = Math.max(this.dynamicIdx, this.lastDynamicIdx);
    this.lastDynamicIdx = this.dynamicIdx;
    this.dyn.setCount(this.dynamicIdx);
    const range = { min: 0, max: used - 1 };
    for (const mesh of this.dyn.meshes) uploadRange(mesh, range);
    const color = this.dyn.load.instanceColor!;
    color.clearUpdateRanges();
    color.addUpdateRange(0, used * 3);
    color.needsUpdate = true;
    for (const b of this.bands) {
      b.count = this.dynamicIdx;
      uploadRange(b, range);
    }
    if (this.frame % 120 === 0) {
      for (const [pid, s] of this.shown) if (s.frame < this.frame - 60) this.shown.delete(pid);
    }

    // Huecos de rack: solo se reescriben los que han cambiado y los palés que una máquina está cargando.
    this.slotRange = { min: Infinity, max: -1 };
    this.staticRange = { min: Infinity, max: -1 };
    for (const pid of away) {
      const loc = state.paletById[pid]?.locId;
      if (loc) this.updateRackSlot(loc, state, away);
    }
    for (const loc of state.rackDirty) this.updateRackSlot(loc, state, away);
    state.rackDirty.length = 0;
    for (const mesh of this.slotBatch.meshes) uploadRange(mesh, this.slotRange);
    if (this.rackBatch) for (const mesh of this.rackBatch.meshes) uploadRange(mesh, this.staticRange);
    if (this.slotRange.max >= 0 && this.slotBatch.load.instanceColor) this.slotBatch.load.instanceColor.needsUpdate = true;
  }

  /** Mallas que la escena debe añadir: palés en movimiento (con sus flejes) y, sin racks, palés de huecos. */
  get meshes(): THREE.Object3D[] {
    return [...this.dyn.meshes, ...this.bands, ...(this.rackBatch ? [] : this.slotBatch.meshes), this.routeGroup, this.instancer.group];
  }
}
