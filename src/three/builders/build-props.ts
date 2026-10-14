import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import { buildYardProps, type BinKind, type Crosswalk, type PropPost, type PropWallSign, type SignKind } from '@/lib/layout/props';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PAINT_WHITE, YARD_MARK_Y } from '@/three/builders/floor';

/** Cubos de reciclaje: cuerpo y tapa en el color de la fracción (contenedores normalizados de la calle). */
const BIN_COLORS: Record<BinKind, { body: number; lid: number }> = {
  resto: { body: 0x5b6470, lid: 0x3a414b },
  papel: { body: 0x2d6cb5, lid: 0x1f4f8c },
  envases: { body: 0xf2c230, lid: 0xd6a51c },
  vidrio: { body: 0x2e8b57, lid: 0x1f6b42 },
};
const POST_GREY = 0x8a95a8;
const BIN_RIM = 0x1b1f25;

const materials = new Map<number, THREE.MeshLambertMaterial>();
function lambertFlat(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
/** Cuerpo del cubo: caja con aristas redondeadas y tapa plana encima. Medidas en metros, origen en el suelo. */
const binBodyGeo = new RoundedBoxGeometry(0.52, 0.86, 0.52, 1, 0.05);
const binLidGeo = new RoundedBoxGeometry(0.56, 0.06, 0.56, 1, 0.025);
const wheelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6);

/** Cubo de reciclaje con cuatro ruedas traseras, tapa y pictograma blanco en la cara frontal. */
function makeBin(kind: BinKind): THREE.Group {
  const g = new THREE.Group();
  const c = BIN_COLORS[kind];
  const body = new THREE.Mesh(binBodyGeo, lambertFlat(c.body));
  body.position.y = 0.43 + 0.1;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const lid = new THREE.Mesh(binLidGeo, lambertFlat(c.lid));
  lid.position.y = 0.99;
  lid.castShadow = true;
  g.add(lid);
  const label = new THREE.Mesh(boxGeo, lambertFlat(PAINT_WHITE));
  label.scale.set(0.3, 0.14, 0.012);
  label.position.set(0, 0.48, 0.265);
  g.add(label);
  const rim = new THREE.Mesh(boxGeo, lambertFlat(BIN_RIM));
  rim.scale.set(0.46, 0.04, 0.02);
  rim.position.set(0, 0.11, 0.262);
  g.add(rim);
  for (const x of [-0.2, 0.2]) {
    const w = new THREE.Mesh(wheelGeo, lambertFlat(BIN_RIM));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.045, -0.2);
    g.add(w);
  }
  return g;
}

/** Textura de un cartel (1024 × 512 px sobre una placa de 2:1 o 1:1). Sin texto legible fuera de la cámara cercana. */
function signTexture(kind: SignKind): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, 512, 512);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (kind === 'speed10') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(256, 256, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 46;
    ctx.strokeStyle = '#d62828';
    ctx.beginPath();
    ctx.arc(256, 256, 226, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = '900 210px system-ui, sans-serif';
    ctx.fillText('10', 256, 240);
    ctx.font = '700 72px system-ui, sans-serif';
    ctx.fillText('km/h', 256, 396);
  } else if (kind === 'pedestrian') {
    ctx.fillStyle = '#1565c0';
    ctx.beginPath();
    ctx.roundRect(16, 16, 480, 480, 36);
    ctx.fill();
    // Pictograma de peatón (cabeza y cuerpo en trazo grueso).
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(256, 150, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 58;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(256, 226);
    ctx.lineTo(240, 340);
    ctx.moveTo(256, 226);
    ctx.lineTo(300, 340);
    ctx.moveTo(240, 340);
    ctx.lineTo(228, 438);
    ctx.moveTo(300, 340);
    ctx.lineTo(312, 438);
    ctx.stroke();
  } else if (kind === 'exit') {
    ctx.fillStyle = '#1b8a3e';
    ctx.beginPath();
    ctx.roundRect(16, 96, 480, 320, 36);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.fillText('SALIDA', 256, 256);
    // Flecha hacia la izquierda.
    ctx.beginPath();
    ctx.moveTo(120, 352);
    ctx.lineTo(60, 300);
    ctx.lineTo(120, 248);
    ctx.lineTo(120, 280);
    ctx.lineTo(180, 280);
    ctx.lineTo(180, 320);
    ctx.lineTo(120, 320);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#1b8a3e';
    ctx.beginPath();
    ctx.roundRect(16, 96, 480, 320, 36);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.fillText('PUNTO DE', 256, 210);
    ctx.fillText('ENCUENTRO', 256, 300);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const signTextures = new Map<SignKind, THREE.Texture | null>();
function signMaterial(kind: SignKind): THREE.MeshBasicMaterial {
  if (!signTextures.has(kind)) signTextures.set(kind, signTexture(kind));
  return new THREE.MeshBasicMaterial({ map: signTextures.get(kind) ?? null, transparent: true, side: THREE.DoubleSide, toneMapped: false });
}

/** Poste con cartel: el cartel va en un plano que mira a +Z (rotY 0). */
function makePost(p: PropPost): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, p.height, 6), lambertFlat(POST_GREY));
  pole.position.y = p.height / 2;
  pole.castShadow = true;
  g.add(pole);
  const size = p.kind === 'speed10' ? 0.62 : 0.7;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(size, p.kind === 'speed10' ? size : size * 0.72), signMaterial(p.kind));
  plate.position.set(0, p.height + 0.16, 0.05);
  g.add(plate);
  g.position.set(p.x, 0, p.z);
  g.rotation.y = p.rotY;
  return g;
}

/** Cartel de pared sobre el plano de la fachada (sin poste). */
function makeWallSign(s: PropWallSign): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.width * 0.5), signMaterial(s.kind));
  mesh.position.set(s.x, s.y, s.z);
  mesh.rotation.y = s.rotY;
  return mesh;
}

/** Paso de cebra: rayas blancas largas en la dirección del tráfico y repartidas a lo ancho del paso. */
function makeCrosswalk(c: Crosswalk, into: THREE.Group) {
  const n = c.stripes;
  const w = c.span / (2 * n - 1);
  const mat = lambertFlat(PAINT_WHITE);
  const start = -c.span / 2 + w / 2;
  for (let i = 0; i < n; i++) {
    const offset = start + i * 2 * w;
    const stripe = new THREE.Mesh(boxGeo, mat);
    stripe.receiveShadow = true;
    if (c.trafficAxis === 'x') {
      stripe.scale.set(c.stripeLen, 0.012, w * 0.96);
      stripe.position.set(c.cx, YARD_MARK_Y, c.cz + offset);
    } else {
      stripe.scale.set(w * 0.96, 0.012, c.stripeLen);
      stripe.position.set(c.cx + offset, YARD_MARK_Y, c.cz);
    }
    into.add(stripe);
  }
}

/** Mobiliario y señalización del almacén (cubos, postes, carteles de pared y pasos de cebra). */
export function buildProps(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'props';
  const props = buildYardProps(layout);

  for (const b of props.bins) {
    const bin = makeBin(b.kind);
    bin.position.set(b.x, 0, b.z);
    group.add(bin);
  }
  for (const p of props.posts) group.add(makePost(p));
  for (const s of props.wallSigns) group.add(makeWallSign(s));
  for (const c of props.crosswalks) makeCrosswalk(c, group);

  // Los cubos y carteles son decoración: no deben capturar clics de la selección de stock ni de entidades.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.raycast = () => {};
  });
  return group;
}
