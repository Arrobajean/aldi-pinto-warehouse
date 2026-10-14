import * as THREE from 'three';

/**
 * Descarte por bloques de una malla instanciada grande (racks y palés de rack, ~20.000 instancias).
 *
 * La malla original se conserva como almacén de datos: el resto del código sigue escribiendo en ella
 * (`setMatrixAt`, `setColorAt`, rangos de subida) y la selección sigue lanzando el rayo contra ella, pero ya no se
 * dibuja. En su lugar se dibujan trozos de `chunkSize` instancias consecutivas (las ubicaciones se recorren pasillo a
 * pasillo, así que cada trozo ocupa una zona compacta) cuyos atributos son vistas (`subarray`) de los de la original.
 * Cada trozo tiene su esfera envolvente, de modo que three.js descarta los que quedan fuera de la cámara y fuera de
 * la cámara de sombras. `sync` traslada a los trozos los cambios marcados en la original.
 */
export class InstanceChunks {
  readonly chunks: THREE.InstancedMesh[] = [];
  private ranges: { start: number; end: number }[] = [];
  private matrixVersion = -1;
  private colorVersion = -1;

  constructor(
    private readonly source: THREE.InstancedMesh,
    chunkSize = 1024,
  ) {
    const parent = source.parent;
    if (!parent) throw new Error('InstanceChunks: la malla debe estar ya en la escena');
    const total = source.count;
    const matrices = source.instanceMatrix.array as Float32Array;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const box = new THREE.Box3();
    if (!source.geometry.boundingSphere) source.geometry.computeBoundingSphere();
    const geoRadius = source.geometry.boundingSphere!.radius;

    for (let start = 0; start < total; start += chunkSize) {
      const end = Math.min(total, start + chunkSize);
      const mesh = new THREE.InstancedMesh(source.geometry, source.material, end - start);
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(matrices.subarray(start * 16, end * 16), 16);
      mesh.instanceMatrix.setUsage(source.instanceMatrix.usage);
      if (source.instanceColor) {
        const colors = source.instanceColor.array as Float32Array;
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors.subarray(start * 3, end * 3), 3);
      }
      // Esfera envolvente de las instancias del trozo (sin las ocultas a escala 0, que la llevarían al origen).
      box.makeEmpty();
      let maxScale = 1;
      for (let i = 0; i < end - start; i++) {
        m.fromArray(mesh.instanceMatrix.array, i * 16);
        const s = m.getMaxScaleOnAxis();
        if (s < 1e-6) continue;
        maxScale = Math.max(maxScale, s);
        box.expandByPoint(p.setFromMatrixPosition(m));
      }
      if (box.isEmpty()) box.expandByPoint(p.set(0, 0, 0));
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      // Margen: el tamaño de la pieza, y holgura para palés que se recolocan dentro del mismo pasillo.
      sphere.radius += geoRadius * maxScale + 2;
      mesh.boundingSphere = sphere;
      mesh.frustumCulled = true;
      mesh.castShadow = source.castShadow;
      mesh.receiveShadow = source.receiveShadow;
      mesh.name = source.name;
      mesh.raycast = () => {};
      mesh.position.copy(source.position);
      mesh.quaternion.copy(source.quaternion);
      mesh.scale.copy(source.scale);
      parent.add(mesh);
      this.chunks.push(mesh);
      this.ranges.push({ start, end });
    }

    // La original no se dibuja, pero sigue en la escena: la selección lanza el rayo contra ella
    // (el raycaster no mira `visible`) y su nombre ya no coincide con los conmutadores de capas.
    source.visible = false;
    source.name = `${source.name}:data`;
    this.matrixVersion = source.instanceMatrix.version;
    this.colorVersion = source.instanceColor?.version ?? -1;
  }

  /** Traslada a los trozos los cambios marcados en la malla original (matrices, colores, geometría). */
  sync() {
    const src = this.source;
    for (const c of this.chunks) if (c.geometry !== src.geometry) c.geometry = src.geometry;
    if (src.instanceMatrix.version !== this.matrixVersion) {
      this.matrixVersion = src.instanceMatrix.version;
      this.propagate(src.instanceMatrix, 16, (c) => c.instanceMatrix);
    }
    if (src.instanceColor && src.instanceColor.version !== this.colorVersion) {
      this.colorVersion = src.instanceColor.version;
      this.propagate(src.instanceColor, 3, (c) => c.instanceColor);
    }
  }

  private propagate(attr: THREE.BufferAttribute, itemSize: number, pick: (c: THREE.InstancedMesh) => THREE.BufferAttribute | null) {
    // Sin rangos marcados, cambió todo.
    const marked = attr.updateRanges.length > 0 ? attr.updateRanges.map((r) => ({ a: r.start / itemSize, b: (r.start + r.count) / itemSize })) : [{ a: 0, b: Infinity }];
    attr.clearUpdateRanges();
    this.chunks.forEach((c, k) => {
      const { start, end } = this.ranges[k];
      const target = pick(c);
      if (!target) return;
      let touched = false;
      for (const { a, b } of marked) {
        const lo = Math.max(a, start);
        const hi = Math.min(b, end);
        if (hi <= lo) continue;
        if (!touched) target.clearUpdateRanges();
        touched = true;
        target.addUpdateRange((lo - start) * itemSize, (hi - lo) * itemSize);
      }
      if (touched) target.needsUpdate = true;
    });
  }
}
