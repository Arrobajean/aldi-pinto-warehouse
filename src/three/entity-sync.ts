import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import { forEachRackSlot } from '@/lib/layout/pinto-layout';
import type { SimState } from '@/lib/sim/types';
import { createCounterbalance, createOrderPicker, createReachTruck, createTruck } from '@/three/builders/models';
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
};

/** Altura de un palé en rack (igual que en build-racks). */
const RACK_PALET_H = 1.2;
/** Puntos máximos de una ruta dibujada. */
const ROUTE_MAX_POINTS = 120;
/** Color de la ruta por tipo de máquina. */
const ROUTE_COLOR: Record<string, number> = { retractil: 0x22a6e0, frontal: 0xf39200, recogepedidos: 0x2ecc71 };

export class EntitySync {
  private machines = new Map<string, ModelRef>();
  private trucks = new Map<string, ModelRef>();
  private dynamicPalets: THREE.InstancedMesh;
  private paletGeo = new THREE.BoxGeometry(1.2, 0.5, 0.8);
  private paletMat = new THREE.MeshLambertMaterial({ color: 0xc9a86a });
  private tmp = new THREE.Object3D();
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
    const cap = 400;
    this.dynamicPalets = new THREE.InstancedMesh(this.paletGeo, this.paletMat, cap);
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

  /** Sincroniza máquinas, camiones, palets sueltos y huecos de rack con el snapshot de la simulación. */
  sync(state: SimState) {
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
      ref.group.position.set(t.pos.x, 0, t.pos.z);
      // Rumbo calculado por la simulación (la tractora mira a −Z en el modelo).
      ref.group.rotation.y = t.heading ?? 0;
    }

    // Palés transportados: van en las horquillas, a la altura de la horquilla.
    const carried = new Set<string>();
    for (const m of state.machines) for (const pid of m.carriedPalets) carried.add(pid);

    let idx = 0;
    for (const m of state.machines) {
      const forkY = (this.machines.get(m.id)?.forkBase ?? 0) + m.liftHeight;
      for (const pid of m.carriedPalets) {
        const p = state.paletById[pid];
        if (!p || idx >= this.dynamicPalets.count) continue;
        this.tmp.position.set(m.pos.x, forkY + 0.3, m.pos.z);
        this.tmp.rotation.set(0, m.heading, 0);
        this.tmp.scale.set(1, 1, 1);
        this.tmp.updateMatrix();
        this.dynamicPalets.setMatrixAt(idx++, this.tmp.matrix);
      }
    }
    for (const [dockId, ids] of Object.entries(state.lanePallets)) {
      const dock = this.layout.docks.find((d) => d.id === dockId);
      if (!dock) continue;
      ids.forEach((_, i) => {
        if (idx >= this.dynamicPalets.count) return;
        this.tmp.position.set(dock.x, 0.5 + (i % 3) * 1.1 + Math.floor(i / 3) * 2.2, 60 + (i % 3) * 0.9);
        this.tmp.rotation.set(0, 0, 0);
        this.tmp.scale.set(1, 1, 1);
        this.tmp.updateMatrix();
        this.dynamicPalets.setMatrixAt(idx++, this.tmp.matrix);
      });
    }
    for (let i = idx; i < this.dynamicPalets.count; i++) {
      this.tmp.position.set(0, -100, 0);
      this.tmp.scale.set(0.001, 0.001, 0.001);
      this.tmp.updateMatrix();
      this.dynamicPalets.setMatrixAt(i, this.tmp.matrix);
    }
    this.dynamicPalets.instanceMatrix.needsUpdate = true;

    // Huecos de rack: solo se reescriben los que han cambiado (y los que hay en tránsito).
    this.slotRange = { min: Infinity, max: -1 };
    this.staticRange = { min: Infinity, max: -1 };
    for (const pid of carried) {
      const loc = state.paletById[pid]?.locId;
      if (loc) this.updateRackSlot(loc, state, carried);
    }
    for (const loc of state.rackDirty) this.updateRackSlot(loc, state, carried);
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
