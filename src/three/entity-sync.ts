import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import type { SimState } from '@/lib/sim/types';
import { createCounterbalance, createOrderPicker, createReachTruck, createTruck } from '@/three/builders/models';

type ModelRef = {
  group: THREE.Group;
  forks?: THREE.Object3D;
  body?: THREE.Object3D;
};

export class EntitySync {
  private machines = new Map<string, ModelRef>();
  private trucks = new Map<string, ModelRef>();
  private dynamicPalets: THREE.InstancedMesh;
  private paletGeo = new THREE.BoxGeometry(1.2, 0.5, 0.8);
  private paletMat = new THREE.MeshLambertMaterial({ color: 0xc9a86a });
  private tmp = new THREE.Object3D();
  private layout: WarehouseLayout;

  constructor(layout: WarehouseLayout, machinesGroup: THREE.Group, trucksGroup: THREE.Group) {
    this.layout = layout;
    this.machineLayer = machinesGroup;
    this.truckLayer = trucksGroup;
    const cap = 400;
    this.dynamicPalets = new THREE.InstancedMesh(this.paletGeo, this.paletMat, cap);
    this.dynamicPalets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dynamicPalets.frustumCulled = false;
    this.paletLayer = new THREE.Group();
  }

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
    ref = { group: created.group, forks: created.nodes.forks, body: created.nodes.body };
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
    ref = { group: t.group };
    this.truckLayer.add(t.group);
    this.trucks.set(id, ref);
    return ref;
  }

  /** Sincroniza máquinas, camiones y palets sueltos con el snapshot de la simulación. */
  sync(state: SimState) {
    // Máquinas
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
      if (ref.forks) ref.forks.position.y = m.hasPalet ? 0.4 : 0;
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
      // Dirección: los camiones avanzan con la tractora hacia +X en el modelo.
      ref.group.rotation.y = 0;
    }

    // Palets sueltos (cargados en máquinas, calles de pre-carga).
    let idx = 0;
    for (const m of state.machines) {
      for (const pid of m.carriedPalets) {
        const p = state.paletById[pid];
        if (!p || idx >= this.dynamicPalets.count) continue;
        this.tmp.position.set(m.pos.x, 0.9, m.pos.z);
        this.tmp.rotation.set(0, 0, 0);
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
  }

  get paletMesh() {
    return this.dynamicPalets;
  }

  /** Group contenedor de los palets dinámicos (por si se pide como capa). */
  get layer() {
    return this.paletLayer;
  }
}