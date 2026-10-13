import * as THREE from 'three';
import { plane } from '@/three/builders/utils';

/** Color base del hormigón industrial (gris cemento, no blanco). */
export const CONCRETE_COLOR = 0x8f9091;
/** Color de las marcas de seguridad (amarillo) y de los pasos peatonales (blanco). */
export const SAFETY_YELLOW = 0xf2c230;
export const PAINT_WHITE = 0xe8ecf0;
/** Metros que cubre una loseta de la textura de hormigón. */
const TILE_M = 6;
/**
 * Alturas de cada capa de suelo (m). Ninguna losa comparte altura con otra que se solape:
 * - nave: base de hormigón opaca sobre el zócalo de 1,2 m, marcas de zona y de pasillo, y marcas de calle;
 * - patio: losa 5 cm sobre el terreno y sus marcas por encima.
 */
export const NAVE_SLAB_Y = 0.02;
export const NAVE_TINT_Y = 0.03;
export const NAVE_LINE_Y = 0.035;
export const MARK_Y = 0.04;
export const YARD_SLAB_Y = 0.05;
export const YARD_MARK_Y = 0.06;

let concreteTex: THREE.CanvasTexture | null = null;

/** Mulberry32: ruido determinista para que la textura no cambie entre recargas. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Textura procedural de hormigón industrial: ruido de grano, manchas suaves y juntas de retracción
 * en cuadrícula. Se genera una sola vez (canvas) y se reutiliza en todos los suelos.
 */
export function concreteTexture(): THREE.CanvasTexture {
  if (concreteTex) return concreteTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible para el hormigón');
  const rand = rng(7);

  ctx.fillStyle = '#9a9b9d';
  ctx.fillRect(0, 0, size, size);

  // Manchas de tono suave (cemento no uniforme).
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 20 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() > 0.5;
    g.addColorStop(0, light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grano fino: píxeles claros y oscuros.
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // Juntas de retracción: una línea oscura en el borde de la loseta (la textura se repite cada TILE_M).
  ctx.fillStyle = 'rgba(40,40,42,0.55)';
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, 0, 3, size);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 3, size, 1);
  ctx.fillRect(3, 0, 1, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // Anisotropía máxima; three.js la limita al máximo de la GPU.
  tex.anisotropy = 16;
  concreteTex = tex;
  return tex;
}

/** Material de hormigón para una superficie de w × d metros (la textura se escala para no estirarse). */
export function concreteMaterial(w: number, d: number, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  const tex = concreteTexture().clone();
  tex.repeat.set(Math.max(1, w / TILE_M), Math.max(1, d / TILE_M));
  tex.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ color: CONCRETE_COLOR, map: tex, ...opts });
}

/** Suelo de hormigón (plano horizontal) en (x, y, z). */
export function concreteFloor(w: number, d: number, x: number, y: number, z: number, name?: string): THREE.Mesh {
  const mesh = plane(w, d, concreteMaterial(w, d), x, y, z);
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  return mesh;
}

/** Material de las marcas: decal con el mismo desplazamiento de profundidad en todas las capas. */
function decalMaterial(color: number) {
  return new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
}

/** Mancha de pintura plana (relleno) sobre el hormigón. */
export function paintFill(w: number, d: number, color: number, x: number, z: number, y = MARK_Y): THREE.Mesh {
  const mesh = plane(w, d, decalMaterial(color), x, y, z);
  mesh.receiveShadow = false;
  return mesh;
}

/** Línea de pintura (banda) de grosor `t` a lo largo de un eje. */
export function paintLine(group: THREE.Group, x0: number, z0: number, x1: number, z1: number, color: number, t = 0.15, y = MARK_Y) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  const mesh = paintFill(len, t, color, (x0 + x1) / 2, (z0 + z1) / 2, y);
  // El plano se crea horizontal con su largo en X; con Euler XYZ (Rx·Rz) un giro −φ en Z da la dirección (cos φ, −sin(−φ)) = (dx, dz)/len.
  mesh.rotation.z = -Math.atan2(dz, dx);
  group.add(mesh);
}

/** Contorno rectangular de pintura (cuatro bandas) alrededor de un rectángulo. */
export function paintOutline(group: THREE.Group, xMin: number, xMax: number, zMin: number, zMax: number, color: number, t = 0.15, y = MARK_Y) {
  paintLine(group, xMin, zMin, xMax, zMin, color, t, y);
  paintLine(group, xMax, zMin, xMax, zMax, color, t, y);
  paintLine(group, xMax, zMax, xMin, zMax, color, t, y);
  paintLine(group, xMin, zMax, xMin, zMin, color, t, y);
}

/** Flecha de sentido de circulación sobre el suelo (cuerpo + punta), mirando a +Z o −Z. */
export function paintArrow(group: THREE.Group, x: number, z: number, dirZ: 1 | -1, color: number, scale = 1) {
  const shape = new THREE.Shape();
  // Flecha apuntando a +Y del plano (luego se gira a −Z/+Z).
  shape.moveTo(-0.25 * scale, -0.9 * scale);
  shape.lineTo(0.25 * scale, -0.9 * scale);
  shape.lineTo(0.25 * scale, 0.1 * scale);
  shape.lineTo(0.6 * scale, 0.1 * scale);
  shape.lineTo(0, 0.9 * scale);
  shape.lineTo(-0.6 * scale, 0.1 * scale);
  shape.lineTo(-0.25 * scale, 0.1 * scale);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.Mesh(geo, decalMaterial(color));
  // Plano XY -> XZ: rotación −90° en X; el "arriba" de la flecha queda en −Z con dirZ = 1.
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = dirZ === 1 ? Math.PI : 0;
  mesh.position.set(x, MARK_Y, z);
  group.add(mesh);
}
