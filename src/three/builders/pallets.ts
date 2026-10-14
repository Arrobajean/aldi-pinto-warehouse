import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Europalé: 1,2 × 0,8 × 0,144 m, origen en el centro de la cara inferior, lado largo en X. */
export const EURO_L = 1.2;
export const EURO_W = 0.8;
export const EURO_H = 0.144;

export type PalletLod = 'lo' | 'hi';
type Usage = Parameters<THREE.BufferAttribute['setUsage']>[0];

const WOOD = 0xc8a46e;
const WOOD_TONES = [0xc8a46e, 0xbf9963, 0xd2b07c];
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/** Caja de madera con color de vértice (todas las piezas llevan los mismos atributos para poder fusionarlas). */
function piece(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Detalle (≈ 200 triángulos): tres tablas inferiores, nueve tacos en 3 × 3 y cinco tablas superiores. */
function buildHi(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.35, 0, 0.35]) parts.push(piece(EURO_L, 0.022, 0.1, 0, 0.011, z, WOOD));
  for (const x of [-0.45, 0, 0.45]) {
    for (const z of [-0.3, 0, 0.3]) parts.push(piece(0.145, 0.1, 0.078, x, 0.072, z, WOOD));
  }
  let z = -EURO_W / 2;
  [0.145, 0.1, 0.145, 0.1, 0.145].forEach((w, i) => {
    parts.push(piece(EURO_L, 0.022, w, 0, EURO_H - 0.011, z + w / 2, WOOD_TONES[i % WOOD_TONES.length]));
    z += w + 0.04;
  });
  return fuse(parts);
}

/** Bajo detalle (≈ 48 triángulos) para estanterías: tablero superior sólido y tres patines. */
function buildLo(): THREE.BufferGeometry {
  const parts = [piece(EURO_L, 0.022, EURO_W, 0, EURO_H - 0.011, 0, WOOD)];
  // Patines hasta el tablero (0,122 m) para que no quede hueco bajo el tablero.
  for (const z of [-0.35, 0, 0.35]) parts.push(piece(EURO_L, EURO_H - 0.022, 0.1, 0, (EURO_H - 0.022) / 2, z, WOOD));
  return fuse(parts);
}

function fuse(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('No se pudo fusionar la geometría del europalé');
  return merged;
}

/**
 * Geometría completa de europalé con carga de mercancía y flejes:
 * - Base: palé de madera real (tablas inferiores, 9 tacos, tablas superiores).
 * - Carga: cajas de cartón corrugado.
 * - Flejes: bandas de flejado horizontal y vertical que aseguran la carga al palé.
 * Altura total 0.764 m, centrado en (0, 0, 0) para que su base esté en -0.382 m.
 */
export function buildDynamicPalletGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const WOOD = 0xc8a46e;
  const WOOD_DARK = 0xb8935c;
  const WOOD_LIGHT = 0xd4b27d;
  const CARTON = 0xd8b580;
  const STRAP = 0x243242;

  // 1. Tablas inferiores (3 patines de 1.2 x 0.022 x 0.1 m)
  for (const z of [-0.35, 0, 0.35]) {
    parts.push(piece(EURO_L, 0.022, 0.1, 0, 0.011, z, WOOD));
  }
  // 2. Tacos de madera (9 tacos de 0.145 x 0.100 x 0.08 m)
  for (const x of [-0.45, 0, 0.45]) {
    for (const z of [-0.35, 0, 0.35]) {
      parts.push(piece(0.145, 0.1, 0.08, x, 0.072, z, WOOD_DARK));
    }
  }
  // 3. Tablas superiores (5 tablas de 1.2 x 0.022 x 0.13 m)
  for (const z of [-0.33, -0.165, 0, 0.165, 0.33]) {
    parts.push(piece(EURO_L, 0.022, 0.13, 0, EURO_H - 0.011, z, WOOD_LIGHT));
  }

  // 4. Carga de cajas sobre el palé (1.14 x 0.62 x 0.74 m)
  const loadH = 0.62;
  const loadBaseY = EURO_H;
  parts.push(piece(1.14, loadH, 0.74, 0, loadBaseY + loadH / 2, 0, CARTON));

  // 5. Flejes de sujeción (bandas de flejado de la flejadora)
  parts.push(piece(1.15, 0.03, 0.75, 0, loadBaseY + loadH * 0.7, 0, STRAP));
  for (const x of [-0.3, 0.3]) {
    parts.push(piece(0.025, loadH + EURO_H, 0.75, x, (loadBaseY + loadH) / 2, 0, STRAP));
  }

  const fused = mergeGeometries(parts);
  if (!fused) throw new Error('No se pudo fusionar la geometría del palé dinámico');

  // Centrar en Y para que el centro geométrico quede en y = 0
  const totalH = EURO_H + loadH; // 0.764 m
  fused.translate(0, -totalH / 2, 0);
  return fused;
}

/**
 * Flejes de un palé en el espacio unitario de su carga (caja de 1 × 1 × 1 centrada en el origen): dos lazos
 * verticales a ±0,3 m del centro y un lazo horizontal. Se instancian aparte para dibujarlos solo en palés flejados
 * (y poder apretarlos mientras la flejadora trabaja).
 */
export function buildBandGeometries(): { a: THREE.BufferGeometry; b: THREE.BufferGeometry; c: THREE.BufferGeometry } {
  const vertical = (x: number) => new THREE.BoxGeometry(0.024, 1.03, 1.035).translate(x, 0, 0);
  return { a: vertical(-0.26), b: vertical(0.26), c: new THREE.BoxGeometry(1.03, 0.05, 1.035).translate(0, 0.2, 0) };
}

const geometries: Partial<Record<PalletLod, THREE.BufferGeometry>> = {};

/** Geometría del palé (GLB si se ha cargado; si no, procedural). Cacheada por nivel de detalle. */
export function euroPalletGeometry(lod: PalletLod): THREE.BufferGeometry {
  let g = geometries[lod];
  if (!g) {
    g = lod === 'hi' ? buildHi() : buildLo();
    geometries[lod] = g;
  }
  return g;
}

const woodMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const loadMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const zeroScale = new THREE.Matrix4().makeScale(0, 0, 0);
const batches = new Set<PalletBatch>();

/** Lote de palés: un palé de madera (sin color por instancia) y una caja de mercancía (color por instancia). */
export class PalletBatch {
  /** Europalé (madera). */
  readonly base: THREE.InstancedMesh;
  /** Caja de mercancía. Es la malla que usa la selección (`instanceId`). */
  readonly load: THREE.InstancedMesh;
  readonly lod: PalletLod;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(count: number, opts: { lod: PalletLod; castShadow?: boolean; usage?: Usage }) {
    this.lod = opts.lod;
    this.base = new THREE.InstancedMesh(euroPalletGeometry(opts.lod), woodMaterial, count);
    this.load = new THREE.InstancedMesh(unitBox, loadMaterial, count);
    for (const mesh of [this.base, this.load]) {
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(opts.usage ?? THREE.StaticDrawUsage);
      mesh.frustumCulled = false;
    }
    // La sombra la proyecta solo la carga (12 triángulos): la de la base (48) queda bajo ella y apenas se ve.
    this.load.castShadow = opts.castShadow ?? true;
    this.base.castShadow = false;
    // Solo la carga responde al puntero: la selección de palés sigue por `load`.
    this.base.raycast = () => {};
    batches.add(this);
  }

  /** Coloca el palé `i`: `y` = cota del suelo del palé; `totalH` = altura total (palé + carga). */
  set(i: number, x: number, y: number, z: number, rotY: number, totalH: number, color?: THREE.Color): void {
    const loadH = Math.max(0.3, totalH - EURO_H);
    this.q.setFromAxisAngle(AXIS_Y, rotY);
    this.p.set(x, y, z);
    this.base.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(1, 1, 1)));
    this.p.set(x, y + EURO_H + loadH / 2, z);
    this.load.setMatrixAt(i, this.m.compose(this.p, this.q, this.s.set(1.14, loadH, 0.78)));
    if (color) this.load.setColorAt(i, color);
  }

  /** Matriz de la carga del palé `i` (para colocar los flejes en el mismo sitio). */
  loadMatrixAt(i: number, target: THREE.Matrix4): THREE.Matrix4 {
    this.load.getMatrixAt(i, target);
    return target;
  }

  /** Oculta el palé `i` en las dos mallas. */
  hide(i: number): void {
    this.base.setMatrixAt(i, zeroScale);
    this.load.setMatrixAt(i, zeroScale);
  }

  /** Número de instancias que se dibujan (las primeras `n`). */
  setCount(n: number): void {
    this.base.count = n;
    this.load.count = n;
  }

  /** Marca las matrices (y colores) para subirlas a la GPU tras cambios. */
  update(): void {
    for (const mesh of [this.base, this.load]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  get meshes(): THREE.InstancedMesh[] {
    return [this.base, this.load];
  }
}

let glbRequested = false;

/**
 * Carga el europalé en GLB (`/models/euro-pallet-hi.glb` y `-lo.glb`) y cambia la geometría de los lotes ya creados.
 * Si los archivos no existen, se queda el procedural: falla en silencio.
 */
export function loadEuroPalletGlb(): Promise<void> {
  if (glbRequested) return Promise.resolve();
  glbRequested = true;
  const loader = new GLTFLoader();
  const tryLod = (lod: PalletLod) =>
    new Promise<void>((resolve) => {
      loader.load(
        `/models/euro-pallet-${lod}.glb`,
        (gltf) => {
          const meshes: THREE.Mesh[] = [];
          gltf.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) meshes.push(o);
          });
          const geo = meshes[0]?.geometry;
          if (geo) {
            if (!geo.getAttribute('color')) {
              geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 3).fill(1), 3));
            }
            geometries[lod] = geo;
            for (const b of batches) if (b.lod === lod) b.base.geometry = geo;
          }
          resolve();
        },
        undefined,
        () => resolve(),
      );
    });
  return Promise.all([tryLod('hi'), tryLod('lo')]).then(() => undefined);
}
