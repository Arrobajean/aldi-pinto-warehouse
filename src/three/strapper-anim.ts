import * as THREE from 'three';

/** Estado de la flejadora que pinta el aparejo (lo calcula `EntitySync` desde la simulación). */
export interface RigInput {
  /** Hay un lote en proceso. */
  active: boolean;
  /** Fleje tendido alrededor del palé por el arco (0 = nada, 1 = lazo completo). */
  feed: number;
  /** Apretado del fleje (0 = flojo, 1 = tenso y a punto de sellar). */
  tight: number;
  /** Destello del cabezal de sellado (0 = apagado). */
  seal: number;
  /** La cinta de rodillos se mueve. */
  belt: boolean;
}

const STRAP_COLOR = 0xffc94d;
const LAMP_IDLE = 0x10b981;
const LAMP_WORK = 0xf59e0b;
const LAMP_SEAL = 0xffffff;

/** Plano del arco (y–z) a x = 0: el lazo de fleje rodea al palé por el interior de los pórticos. */
const RING_Z = 0.84;
const RING_Y0 = 0.5;
const RING_Y1 = 2.3;
const RING_PITCH = 0.5;

/**
 * Animación de una flejadora: el fleje se tiende por el arco y se aprieta alrededor del palé, el cabezal sella con un
 * destello, la baliza cambia de estado y las bandas de la cinta de rodillos avanzan mientras hay palés en movimiento.
 * Se cuelga del grupo que construye `buildStrapperMesh`, sin modificarlo.
 */
export class StrapperRig {
  private ring = new THREE.Group();
  private segs: { mesh: THREE.Mesh; sy: number; sz: number; dy: number; dz: number; len: number }[] = [];
  private lamp: THREE.Mesh;
  private weld: THREE.Mesh;
  private stripes: THREE.InstancedMesh;
  private stripeBase: number[] = [];
  private phase = 0;
  private flow: number;
  private half: number;
  private tmp = new THREE.Object3D();

  constructor(group: THREE.Group, width: number, flow: number) {
    this.flow = flow || 1;
    this.half = width / 2;

    const strap = new THREE.MeshBasicMaterial({ color: STRAP_COLOR });
    // Perímetro del arco recorrido desde la esquina superior +z: techo, lado −z, suelo y lado +z.
    const pts: [number, number][] = [
      [RING_Y1, RING_Z],
      [RING_Y1, -RING_Z],
      [RING_Y0, -RING_Z],
      [RING_Y0, RING_Z],
      [RING_Y1, RING_Z],
    ];
    for (let i = 0; i < 4; i++) {
      const [y0, z0] = pts[i];
      const [y1, z1] = pts[i + 1];
      const len = Math.hypot(y1 - y0, z1 - z0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1, 1), strap);
      mesh.visible = false;
      this.ring.add(mesh);
      this.segs.push({ mesh, sy: y0, sz: z0, dy: (y1 - y0) / len, dz: (z1 - z0) / len, len });
    }
    group.add(this.ring);

    // Baliza de estado en la cara de la salida del cabezal y punto de sellado en el techo del arco.
    this.lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: LAMP_IDLE }));
    this.lamp.position.set(0.48, 2.8, 0);
    group.add(this.lamp);
    this.weld = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), new THREE.MeshBasicMaterial({ color: LAMP_SEAL }));
    this.weld.position.set(0, RING_Y1 - 0.02, 0);
    this.weld.visible = false;
    group.add(this.weld);

    // Bandas sobre cada rodillo: al desplazarse con la cinta dan la sensación de rodillos girando.
    for (let x = -this.half + 0.3; x <= this.half - 0.3; x += RING_PITCH) this.stripeBase.push(x);
    this.stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.012, 1.26), new THREE.MeshBasicMaterial({ color: 0x475569 }), this.stripeBase.length);
    this.stripes.frustumCulled = false;
    this.stripes.position.y = 0.62;
    group.add(this.stripes);
    this.writeStripes();
  }

  private writeStripes() {
    this.stripeBase.forEach((x, i) => {
      this.tmp.position.set(x + this.phase, 0, 0);
      this.tmp.updateMatrix();
      this.stripes.setMatrixAt(i, this.tmp.matrix);
    });
    this.stripes.instanceMatrix.needsUpdate = true;
  }

  update(inp: RigInput, dt: number): void {
    // Cinta de rodillos: las bandas avanzan en el sentido del flujo y se repiten cada paso de rodillo.
    if (inp.belt) {
      this.phase = (this.phase + this.flow * 0.45 * dt) % RING_PITCH;
      this.writeStripes();
    }

    // Fleje: se va tendiendo por el arco y luego se aprieta hacia el centro del palé.
    const feed = Math.max(0, Math.min(1, inp.feed));
    this.ring.visible = feed > 0.001;
    const total = this.segs.reduce((a, s) => a + s.len, 0);
    let from = 0;
    const squeeze = 1 - 0.12 * inp.tight;
    const cy = (RING_Y0 + RING_Y1) / 2;
    for (const s of this.segs) {
      const f = Math.max(0, Math.min(1, (feed * total - from) / s.len));
      from += s.len;
      s.mesh.visible = f > 0.001;
      if (!s.mesh.visible) continue;
      const len = Math.max(0.001, s.len * f);
      // Origen del tramo y centro del trozo ya tendido.
      const oy = cy + (s.sy - cy) * squeeze;
      const oz = s.sz * squeeze;
      const horizontal = s.dz !== 0;
      const run = len * squeeze;
      s.mesh.scale.set(1, horizontal ? 0.06 : run, horizontal ? run : 0.06);
      s.mesh.position.set(0, oy + (s.dy * run) / 2, oz + (s.dz * run) / 2);
    }

    // Baliza: verde en reposo, ámbar trabajando y blanca al sellar.
    const lampMat = this.lamp.material as THREE.MeshBasicMaterial;
    lampMat.color.setHex(inp.seal > 0 ? LAMP_SEAL : inp.active ? LAMP_WORK : LAMP_IDLE);
    this.weld.visible = inp.seal > 0 && Math.floor(inp.seal * 8) % 2 === 0;
  }
}
