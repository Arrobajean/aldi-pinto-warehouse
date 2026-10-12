import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import { forEachRackSlot } from '@/lib/layout/pinto-layout';
import type { Machine, SimState, Truck } from '@/lib/sim/types';
import { createCounterbalance, createOrderPicker, createPalletTruck, createReachTruck, createTruck } from '@/three/builders/models';
import type { RacksModel } from '@/three/builders/build-racks';

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
  /** Altura de las horquillas con la horquilla abajo. */
  forkBase: number;
  body?: THREE.Object3D;
  /** Recogida en curso: cuántos palés del lote ya se muestran en la máquina. */
  pickRun?: { taskId: string; total: number };
  /** Pose suavizada del camión (posición y rumbo que se dibujan). */
  pose?: TruckPose;
};

type TruckPose = { x: number; z: number; heading: number };

/** Posición z de la origen del camión retrocedido en el muelle (trasera del remolque ~1 m antes de la puerta z=80). */
const DOCK_TRUCK_Z = 92.6;
/** Velocidad de convergencia de la pose dibujada hacia la pose de la simulación (1/s). */
const TRUCK_SMOOTH_RATE = 8;

/** Diferencia angular mínima entre dos rumbos, en (−π, π]. */
function shortestAngle(d: number): number {
  let a = d % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Altura de un palé en rack (igual que en build-racks). */
const RACK_PALET_H = 1.2;
/** Altura del centro de un palé apoyado en el suelo (caja de 0,5 m). */
const FLOOR_PALET_Y = 0.25;
/** Altura del centro de un palé sobre las horquillas (origen de horquilla + tablero). */
const FORK_PALET_Y = 0.28;
/** Separación entre palés contiguos en una fila o en la plataforma. */
const PALET_PITCH = 1.3;
/** Capacidad de instancias de palés dinámicos. */
const DYNAMIC_PALET_CAP = 600;
/** Filas de palés en una calle de pre-carga (la calle mide ~22 m). */
const LANE_ROWS = 12;
/** Filas de palés en el suelo junto a una flejadora. */
const STRAP_ROWS = 6;
/** Capas apiladas máximas en el suelo; con más palés, el exceso no se dibuja (la simulación sí lo cuenta). */
const MAX_FLOOR_LAYERS = 3;
/** Puntos máximos de una ruta dibujada. */
const ROUTE_MAX_POINTS = 120;
/** Color de la ruta por tipo de máquina. */
const ROUTE_COLOR: Record<string, number> = { retractil: 0x22a6e0, frontal: 0xf39200, recogepedidos: 0x2ecc71, transpaleta: 0xb07cff };

export class EntitySync {
  private machines = new Map<string, ModelRef>();
  private trucks = new Map<string, ModelRef>();
  private dynamicPalets: THREE.InstancedMesh;
  private paletGeo = new THREE.BoxGeometry(1.2, 0.5, 0.8);
  private paletMat = new THREE.MeshLambertMaterial({ color: 0xc9a86a });
  private tmp = new THREE.Object3D();
  private scratchVec = new THREE.Vector3();
  /** Siguiente instancia libre de la malla de palés dinámicos (se recalcula en cada sincronización). */
  private dynamicIdx = 0;
  /** Palés ya colocados en este fotograma: evita dibujar un mismo palé dos veces. */
  private drawn = new Set<string>();
  private layout: WarehouseLayout;

  // Palés de rack: el palé inicial de cada hueco vive en `staticMesh` (creado por buildRacks).
  // Cuando un hueco cambia, ese palé estático se oculta y el hueco lo dibuja `slotMesh`.
  private staticMesh: THREE.InstancedMesh | null;
  private staticIndex = new Map<string, number>();
  private slotMesh: THREE.InstancedMesh;
  private slotIndex = new Map<string, number>();
  private slotPos = new Map<string, { x: number; y: number; z: number }>();
  private slotGeo = new THREE.BoxGeometry(1.2, RACK_PALET_H, 0.8);
  private zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  private hiddenStatic = new Set<number>();
  private slotRange = { min: Infinity, max: -1 };
  private staticRange = { min: Infinity, max: -1 };

  constructor(layout: WarehouseLayout, machinesGroup: THREE.Group, trucksGroup: THREE.Group, racks: RacksModel | null) {
    this.layout = layout;
    this.machineLayer = machinesGroup;
    this.truckLayer = trucksGroup;
    this.dynamicPalets = new THREE.InstancedMesh(this.paletGeo, this.paletMat, DYNAMIC_PALET_CAP);
    this.dynamicPalets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dynamicPalets.frustumCulled = false;
    this.paletLayer = new THREE.Group();

    // Un hueco por cada ubicación de rack, oculto al principio.
    let n = 0;
    forEachRackSlot(layout, (slot) => {
      this.slotIndex.set(slot.locationId, n++);
      this.slotPos.set(slot.locationId, { x: slot.x, y: slot.y, z: slot.z });
    });
    this.slotMesh = new THREE.InstancedMesh(this.slotGeo, this.paletMat, n);
    this.slotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.slotMesh.frustumCulled = false;
    this.slotMesh.name = 'slot-pallets';
    for (let i = 0; i < n; i++) this.slotMesh.setMatrixAt(i, this.zeroMatrix);
    this.slotMesh.instanceMatrix.needsUpdate = true;

    if (racks) {
      this.staticMesh = racks.paletMesh;
      racks.byIndex.forEach((meta, i) => this.staticIndex.set(meta.locId, i));
    } else {
      this.staticMesh = null;
    }
  }

  private routeGroup = new THREE.Group();
  private machineLayer: THREE.Group;
  private truckLayer: THREE.Group;
  private paletLayer: THREE.Group;

  private getMachine(id: string, kind: string): ModelRef {
    let ref = this.machines.get(id);
    if (ref) return ref;
    const created =
      kind === 'retractil'
        ? createReachTruck()
        : kind === 'frontal'
          ? createCounterbalance()
          : kind === 'transpaleta'
            ? createPalletTruck()
            : createOrderPicker();
    created.group.userData.entityId = id;
    created.group.userData.entityKind = 'machine';
    ref = {
      group: created.group,
      forks: created.nodes.forks,
      forkBase: created.nodes.forks.position.y,
      body: created.nodes.body,
    };
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
    ref = { group: t.group, forkBase: 0 };
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

  /** Muestra u oculta el palé de un hueco según lo que contenga y si está siendo transportado. */
  private updateRackSlot(loc: string, state: SimState, carried: Set<string>) {
    const occupiedBy = state.rackOccupancy[loc];
    const visible = occupiedBy !== undefined && !carried.has(occupiedBy);

    // El palé inicial del hueco deja de mostrarse en cuanto el hueco cambia.
    const si = this.staticIndex.get(loc);
    if (si !== undefined && this.staticMesh && !this.hiddenStatic.has(si)) {
      this.hiddenStatic.add(si);
      this.staticMesh.setMatrixAt(si, this.zeroMatrix);
      this.staticRange.min = Math.min(this.staticRange.min, si);
      this.staticRange.max = Math.max(this.staticRange.max, si);
    }

    const di = this.slotIndex.get(loc);
    const pos = this.slotPos.get(loc);
    if (di === undefined || !pos) return;
    this.slotRange.min = Math.min(this.slotRange.min, di);
    this.slotRange.max = Math.max(this.slotRange.max, di);
    if (visible) {
      this.tmp.position.set(pos.x, pos.y + RACK_PALET_H / 2, pos.z);
      this.tmp.rotation.set(0, 0, 0);
      this.tmp.scale.set(1, 1, 1);
      this.tmp.updateMatrix();
      this.slotMesh.setMatrixAt(di, this.tmp.matrix);
    } else {
      this.slotMesh.setMatrixAt(di, this.zeroMatrix);
    }
  }

  /** Palés que una máquina enseña en sus horquillas. En una recogida, el lote aparece según avanza la ruta. */
  private shownCarried(m: Machine, ref: ModelRef, state: SimState): string[] {
    const n = m.carriedPalets.length;
    if (n === 0) return [];
    const task = m.taskId ? state.tasks.find((t) => t.id === m.taskId) : undefined;
    if (!task || task.kind !== 'pick') {
      ref.pickRun = undefined;
      return m.carriedPalets;
    }
    // La ruta de recogida se mide al primer fotograma que la ve; el avance es la parte ya recorrida.
    if (!ref.pickRun || ref.pickRun.taskId !== task.id) ref.pickRun = { taskId: task.id, total: Math.max(1, m.route.length) };
    const { total } = ref.pickRun;
    const done = m.route.length === 0 ? 1 : Math.min(1, Math.max(0, (total - m.route.length) / total));
    const count = m.route.length === 0 ? n : Math.min(n, Math.ceil(done * n));
    return m.carriedPalets.slice(0, count);
  }

  /** Dibuja un palé (si existe y no está ya dibujado) en la malla dinámica, en coordenadas de mundo. */
  private placePalet(state: SimState, pid: string, at: THREE.Vector3, rotY: number): boolean {
    if (this.drawn.has(pid) || !state.paletById[pid] || this.dynamicIdx >= this.dynamicPalets.count) return false;
    this.drawn.add(pid);
    this.tmp.position.copy(at);
    this.tmp.rotation.set(0, rotY, 0);
    this.tmp.scale.set(1, 1, 1);
    this.tmp.updateMatrix();
    this.dynamicPalets.setMatrixAt(this.dynamicIdx++, this.tmp.matrix);
    return true;
  }

  private placePaletAt(state: SimState, pid: string, x: number, y: number, z: number, rotY: number) {
    this.placePalet(state, pid, this.scratchVec.set(x, y, z), rotY);
  }

  /**
   * Palé k-ésimo de un punto de suelo (entrada o salida de flejadora): dos columnas a lo ancho,
   * filas hacia fuera (`outDir` en X) y capas apiladas. Lo que excede la capacidad no se dibuja.
   */
  private placeOnFloorGrid(state: SimState, pid: string, k: number, x: number, z: number, outDir: number) {
    const col = k % 2;
    const row = Math.floor(k / 2) % STRAP_ROWS;
    const layer = Math.floor(k / (2 * STRAP_ROWS));
    if (layer >= MAX_FLOOR_LAYERS) return;
    this.placePaletAt(state, pid, x + outDir * (0.9 + row * PALET_PITCH), FLOOR_PALET_Y + layer * 0.5, z + (col - 0.5) * 1.25, 0);
  }

  /** Palés de las flejadoras: cola de entrada, lote en proceso y salida (lotes flejados y en espera de la ESE). */
  private syncStrappers(state: SimState) {
    for (const st of state.strappers) {
      const station = this.layout.strappers.find((s) => s.id === st.id);
      if (!station) continue;
      const cx = (station.rect.xMin + station.rect.xMax) / 2;
      const cz = (station.rect.zMin + station.rect.zMax) / 2;

      // Cola de entrada: palés en el suelo, hacia el exterior de la flejadora.
      const inDir = Math.sign(station.input.x - cx) || 1;
      let j = 0;
      for (const entry of st.queue) {
        for (const pid of entry.paletIds) this.placeOnFloorGrid(state, pid, j++, station.input.x, station.input.z, inDir);
      }

      // Lote en proceso: centrado sobre la mesa de flejado.
      const cur = st.current?.paletIds ?? [];
      cur.forEach((pid, k) => this.placePaletAt(state, pid, cx + (k - (cur.length - 1) / 2) * PALET_PITCH, FLOOR_PALET_Y, cz, 0));

      // Salida: lotes flejados y lotes encolados para la transpaleta ESE (en el suelo, junto a la salida).
      const outIds: string[] = [];
      for (const e of state.strapOut) if (e.strapperId === st.id) outIds.push(...e.paletIds);
      for (const task of state.tasks) {
        if (task.kind === 'transfer' && task.state === 'queued' && task.from.x === station.output.x && task.from.z === station.output.z) {
          outIds.push(...task.paletIds);
        }
      }
      const outDir = Math.sign(station.output.x - cx) || 1;
      outIds.forEach((pid, k) => this.placeOnFloorGrid(state, pid, k, station.output.x, station.output.z, outDir));
    }
  }

  /**
   * Pose de dibujo del camión. En el muelle, el camión se dibuja retrocedido: el remolque (13,6 m, trasera
   * hacia +Z en el modelo) apoya su trasera junto a la puerta (z=80) y la tractora queda en el patio.
   */
  private truckPose(t: Truck): TruckPose {
    if (t.status === 'at_dock' && t.dockId) {
      const dock = this.layout.docks.find((d) => d.id === t.dockId);
      if (dock) return { x: dock.x, z: DOCK_TRUCK_Z, heading: Math.PI };
    }
    return { x: t.pos.x, z: t.pos.z, heading: t.heading ?? 0 };
  }

  /** Sincroniza máquinas, camiones, palets sueltos y huecos de rack con el snapshot de la simulación. */
  sync(state: SimState, dt = 1 / 60) {
    // Máquinas: la horquilla sube o baja con su altura real.
    const machineIds = new Set(state.machines.map((m) => m.id));
    for (const [id, ref] of this.machines) {
      if (!machineIds.has(id)) {
        this.machineLayer.remove(ref.group);
        this.machines.delete(id);
      }
    }
    for (const m of state.machines) {
      const ref = this.getMachine(m.id, m.kind);
      ref.group.position.set(m.pos.x, 0, m.pos.z);
      ref.group.rotation.y = m.heading;
      if (ref.forks) ref.forks.position.y = ref.forkBase + m.liftHeight;
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
      const ref = this.getTruck(t.id, t.temp !== 'dry');
      const target = this.truckPose(t);
      if (!ref.pose) {
        ref.pose = { ...target };
      } else {
        // Suavizado: el camión llega al muelle girando hacia atrás sin saltar.
        const k = 1 - Math.exp(-dt * TRUCK_SMOOTH_RATE);
        ref.pose.x += (target.x - ref.pose.x) * k;
        ref.pose.z += (target.z - ref.pose.z) * k;
        ref.pose.heading += shortestAngle(target.heading - ref.pose.heading) * k;
      }
      ref.group.position.set(ref.pose.x, 0, ref.pose.z);
      ref.group.rotation.y = ref.pose.heading;
    }

    // Cada palé se dibuja una sola vez: idx avanza por la malla dinámica y `drawn` evita repetirlos.
    this.dynamicIdx = 0;
    this.drawn.clear();

    // Palés en máquinas: sobre las horquillas, con la altura real de la horquilla.
    const shownOnMachines = new Set<string>();
    for (const m of state.machines) {
      const ref = this.machines.get(m.id);
      if (!ref?.forks) continue;
      const shown = this.shownCarried(m, ref, state);
      if (shown.length === 0) continue;
      ref.group.updateWorldMatrix(true, true);
      shown.forEach((pid, k) => {
        // Varios palés se colocan en una pequeña fila sobre la plataforma: 2 por fila, filas hacia delante.
        const col = k % 2;
        const row = Math.floor(k / 2);
        const local = new THREE.Vector3((col - 0.5) * PALET_PITCH, FORK_PALET_Y, 0.6 + row * 0.85);
        ref.forks!.localToWorld(local);
        if (this.placePalet(state, pid, local, ref.group.rotation.y)) shownOnMachines.add(pid);
      });
    }

    // Flejadoras: entrada (cola), lote en proceso, salida y lotes en espera de la transpaleta ESE.
    this.syncStrappers(state);

    // Calles de pre-carga: palés apoyados en el suelo, en fila junto a la puerta.
    for (const [dockId, ids] of Object.entries(state.lanePallets)) {
      const dock = this.layout.docks.find((d) => d.id === dockId);
      if (!dock) continue;
      ids.forEach((pid, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2) % LANE_ROWS;
        const layer = Math.floor(i / (2 * LANE_ROWS));
        if (layer >= MAX_FLOOR_LAYERS) return;
        this.placePaletAt(state, pid, dock.x + (col - 0.5) * 1.25, FLOOR_PALET_Y + layer * 0.5, 58 + row * 0.9, 0);
      });
    }

    // Palés de una tarea encolada que aún no ha cogido ninguna máquina (salida de la calle hacia el muelle).
    for (const task of state.tasks) {
      if (task.state !== 'queued' || task.kind !== 'dock_shift') continue;
      task.paletIds.forEach((pid, i) => this.placePaletAt(state, pid, task.from.x + i * PALET_PITCH, FLOOR_PALET_Y, task.from.z, 0));
    }

    for (let i = this.dynamicIdx; i < this.dynamicPalets.count; i++) {
      this.tmp.position.set(0, -100, 0);
      this.tmp.scale.set(0.001, 0.001, 0.001);
      this.tmp.updateMatrix();
      this.dynamicPalets.setMatrixAt(i, this.tmp.matrix);
    }
    this.dynamicPalets.instanceMatrix.needsUpdate = true;

    // Huecos de rack: solo se reescriben los que han cambiado y los palés que una máquina está cargando.
    this.slotRange = { min: Infinity, max: -1 };
    this.staticRange = { min: Infinity, max: -1 };
    for (const pid of shownOnMachines) {
      const loc = state.paletById[pid]?.locId;
      if (loc) this.updateRackSlot(loc, state, shownOnMachines);
    }
    for (const loc of state.rackDirty) this.updateRackSlot(loc, state, shownOnMachines);
    state.rackDirty.length = 0;
    uploadRange(this.slotMesh, this.slotRange);
    if (this.staticMesh) uploadRange(this.staticMesh, this.staticRange);
  }

  /** Mallas que la escena debe añadir: palés en movimiento y palés de huecos. */
  get meshes(): THREE.Object3D[] {
    return [this.dynamicPalets, this.slotMesh, this.routeGroup];
  }

  /** Group contenedor de los palets dinámicos (por si se pide como capa). */
  get layer() {
    return this.paletLayer;
  }
}
