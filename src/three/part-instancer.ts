import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Dibujo instanciado de modelos hechos de muchas piezas: vehículos (máquinas y camiones) y carteles de pasillo.
 *
 * Cada modelo se construye con decenas de piezas sueltas (≈ 60–100 mallas por vehículo, unas 7.000 llamadas de
 * dibujo con toda la flota). `bake` fusiona las piezas fijas de cada nodo móvil (raíz, horquillas, mástil, ruedas,
 * puertas, operario…) en una sola geometría con color por vértice, y deja la jerarquía de `Object3D` intacta para que
 * la animación siga moviendo los mismos nodos. Los nodos con la misma geometría fusionada (p. ej. la carrocería de
 * todos los recogepedidos) se dibujan juntos con un `InstancedMesh`, cuyas matrices escribe `update` en cada fotograma.
 */

/** Material único de las piezas de color liso: color por vértice y sombreado plano, como `shade()`. */
const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
  castShadow: boolean;
  renderOrder: number;
}

interface Batch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  renderOrder: number;
  mesh: THREE.InstancedMesh | null;
  /** Nodo dibujado en cada instancia de este fotograma (para la selección). */
  owners: THREE.Object3D[];
  count: number;
}

const BATCHES_KEY = 'instBatches';

/**
 * Pieza de color liso que se dibuja igual con `vertexColorMaterial` (Lambert plano, opaco, sin mapas ni emisivo):
 * pasa a color por vértice. Cualquier otro material (texturas, transparencias, desfase de polígono…) se conserva.
 */
function isPlainColor(material: THREE.Material): material is THREE.MeshLambertMaterial {
  const m = material as THREE.MeshLambertMaterial;
  return (
    m instanceof THREE.MeshLambertMaterial &&
    m.flatShading &&
    !m.map &&
    !m.alphaMap &&
    !m.emissiveMap &&
    !m.vertexColors &&
    !m.transparent &&
    m.opacity === 1 &&
    m.side === THREE.FrontSide &&
    !m.polygonOffset &&
    m.depthWrite &&
    m.depthTest &&
    m.colorWrite &&
    m.emissive.getHex() === 0
  );
}

const materialKeys = new WeakMap<THREE.Material, string>();
/** Clave de un material por su contenido: muchas piezas crean su propio material idéntico al de las demás. */
function materialKey(material: THREE.Material): string {
  let key = materialKeys.get(material);
  if (key) return key;
  const m = material as THREE.Material & Record<string, unknown>;
  const props: unknown[] = [m.type, m.side, m.transparent, m.opacity, m.depthWrite, m.depthTest, m.colorWrite, m.blending, m.alphaTest];
  props.push(m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.vertexColors, m.flatShading, m.wireframe, m.toneMapped, m.fog);
  for (const name of ['color', 'emissive']) {
    const c = m[name];
    props.push(c instanceof THREE.Color ? c.getHexString() : null);
  }
  for (const name of ['roughness', 'metalness', 'emissiveIntensity']) props.push(m[name] ?? null);
  for (const name of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'lightMap', 'envMap', 'bumpMap']) {
    const t = m[name];
    props.push(t instanceof THREE.Texture ? t.uuid : null);
  }
  // Los materiales con código propio (onBeforeCompile) no se comparten.
  if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) props.push(m.uuid);
  key = JSON.stringify(props);
  materialKeys.set(material, key);
  return key;
}

/** Clave de una geometría por su contenido (las piezas iguales de distintos vehículos comparten clave). */
function geometryKey(g: THREE.BufferGeometry): string {
  const params = (g as THREE.BufferGeometry & { parameters?: unknown }).parameters;
  return params ? `${g.type}${JSON.stringify(params)}` : g.uuid;
}

function partSignature(p: Part): string {
  const m = p.matrix.elements.map((v) => v.toFixed(4)).join(',');
  const color = isPlainColor(p.material) ? p.material.color.getHexString() : materialKey(p.material);
  return `${geometryKey(p.geometry)}|${m}|${color}|${p.castShadow ? 1 : 0}`;
}

/** Fusiona las piezas en el sistema del nodo; con `vertexColor`, el color del material pasa a cada vértice. */
function mergeParts(parts: Part[], vertexColor: boolean): THREE.BufferGeometry {
  // Atributos comunes a todas las piezas (la fusión exige los mismos): posición y normal siempre; uv y color,
  // solo si el material los usa y todas los traen.
  const keep = ['position', 'normal'];
  if (!vertexColor) {
    if (parts.every((p) => p.geometry.getAttribute('uv'))) keep.push('uv');
    const usesColor = (parts[0].material as THREE.MeshBasicMaterial).vertexColors;
    if (usesColor && parts.every((p) => p.geometry.getAttribute('color'))) keep.push('color');
  }
  const geos = parts.map((p) => {
    const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
    g.morphAttributes = {};
    g.clearGroups();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(p.matrix);
    if (vertexColor) {
      const c = (p.material as THREE.MeshLambertMaterial).color;
      const n = g.getAttribute('position').count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('No se pudo fusionar la geometría del vehículo');
  merged.computeBoundingSphere();
  return merged;
}

export class PartInstancer {
  /** Grupo con las mallas instanciadas (se añade a la escena). */
  readonly group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private meshes: THREE.InstancedMesh[] = [];

  constructor(name = 'part-instances') {
    this.group.name = name;
  }

  /**
   * Prepara un modelo recién creado. `animated` son los nodos cuyo transform cambia después (horquillas, ruedas,
   * puertas…): cada uno conserva su posición en la jerarquía y se dibuja con sus piezas fijas fusionadas.
   */
  bake(root: THREE.Object3D, animated: Iterable<THREE.Object3D | undefined>, opts: { keep?: (mesh: THREE.Mesh) => boolean } = {}) {
    const pivots = new Set<THREE.Object3D>([root]);
    for (const o of animated) if (o) pivots.add(o);
    for (const pivot of pivots) this.bakePivot(pivot, pivots, opts.keep);
  }

  private bakePivot(pivot: THREE.Object3D, pivots: Set<THREE.Object3D>, keep?: (mesh: THREE.Mesh) => boolean) {
    const parts: Part[] = [];
    const consumed: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D, matrix: THREE.Matrix4) => {
      // Se dibujan tal cual: las mallas con varios materiales (p. ej. el tablero de un cartel, una textura por cara),
      // las instanciadas y las que pide `keep` (p. ej. las zonas invisibles que usa la selección).
      if (o instanceof THREE.Mesh && o.visible && !Array.isArray(o.material) && !(o instanceof THREE.InstancedMesh) && !keep?.(o)) {
        parts.push({ geometry: o.geometry, material: o.material as THREE.Material, matrix, castShadow: o.castShadow, renderOrder: o.renderOrder });
        consumed.push(o);
      }
      for (const child of o.children) {
        if (pivots.has(child) || !child.visible) continue;
        child.updateMatrix();
        visit(child, matrix.clone().multiply(child.matrix));
      }
    };
    visit(pivot, new THREE.Matrix4());
    if (parts.length === 0) return;

    // Un lote por tipo de material: color liso (casi todo) y, aparte, cada material con textura.
    const groups = new Map<string, Part[]>();
    for (const p of parts) {
      const key = `${isPlainColor(p.material) ? 'vc' : materialKey(p.material)}@${p.renderOrder}`;
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    const batches: Batch[] = [];
    for (const [key, list] of groups) {
      const vertexColor = key.startsWith('vc@');
      const signature = `${key}#${list.map(partSignature).join(';')}`;
      let batch = this.batches.get(signature);
      if (!batch) {
        batch = {
          geometry: mergeParts(list, vertexColor),
          material: vertexColor ? vertexColorMaterial : list[0].material,
          castShadow: list.some((p) => p.castShadow),
          renderOrder: list[0].renderOrder,
          mesh: null,
          owners: [],
          count: 0,
        };
        this.batches.set(signature, batch);
      }
      batches.push(batch);
    }
    pivot.userData[BATCHES_KEY] = batches;

    // Las piezas fusionadas dejan de dibujarse: las hojas se quitan; las que tienen hijos (o son nodos móviles)
    // se quedan en la jerarquía, pero fuera de todas las capas de render.
    for (const mesh of consumed) {
      if (mesh === pivot || mesh.children.length > 0) mesh.layers.disableAll();
      else mesh.removeFromParent();
    }
  }

  /** Escribe las matrices de todas las piezas visibles bajo `roots` (máquinas y camiones). */
  update(roots: THREE.Object3D[]) {
    for (const b of this.batches.values()) b.count = 0;
    for (const root of roots) {
      root.updateMatrixWorld();
      root.traverseVisible((o) => {
        const list = o.userData[BATCHES_KEY] as Batch[] | undefined;
        if (list) for (const b of list) this.push(b, o);
      });
    }
    for (const b of this.batches.values()) {
      if (!b.mesh) continue;
      b.mesh.count = b.count;
      b.owners.length = b.count;
      const attr = b.mesh.instanceMatrix;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, b.count * 16);
      attr.needsUpdate = true;
      // Las instancias se mueven: la esfera envolvente se recalcula solo si se usa (selección).
      b.mesh.boundingSphere = null;
    }
  }

  private push(b: Batch, owner: THREE.Object3D) {
    if (!b.mesh || b.count >= b.mesh.instanceMatrix.count) this.grow(b);
    b.mesh!.setMatrixAt(b.count, owner.matrixWorld);
    b.owners[b.count] = owner;
    b.count++;
  }

  private grow(b: Batch) {
    const prev = b.mesh;
    const capacity = Math.max(8, (prev?.instanceMatrix.count ?? 0) * 2);
    const mesh = new THREE.InstancedMesh(b.geometry, b.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = b.castShadow;
    mesh.renderOrder = b.renderOrder;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.batch = b;
    if (prev) {
      mesh.instanceMatrix.array.set(prev.instanceMatrix.array.subarray(0, b.count * 16));
      prev.removeFromParent();
      prev.dispose();
      this.meshes = this.meshes.filter((m) => m !== prev);
    }
    b.mesh = mesh;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  /** Nodo del vehículo bajo el rayo (el más cercano), o `null`. */
  pick(raycaster: THREE.Raycaster): THREE.Object3D | null {
    const hits = raycaster.intersectObjects(this.meshes, false);
    for (const hit of hits) {
      const b = hit.object.userData.batch as Batch | undefined;
      if (b && hit.instanceId !== undefined && hit.instanceId < b.count) return b.owners[hit.instanceId];
    }
    return null;
  }

  /** Número de llamadas de dibujo (lotes con alguna instancia). */
  get drawCalls(): number {
    let n = 0;
    for (const b of this.batches.values()) if (b.count > 0) n++;
    return n;
  }
}
