import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { createBrandDecal } from '@/three/branding';

export interface AnimatedMachine {
  group: THREE.Group;
  nodes: {
    forks: THREE.Group;
    mast: THREE.Object3D;
    wheels: THREE.Object3D[];
    body: THREE.Object3D;
    palletGrip: THREE.Group;
    /** Operario a pie o sentado (si lo lleva), para balanceo y cambio de postura. */
    operator?: THREE.Object3D;
  };
}

/** Cota del piso de la caja del semirremolque sobre el patio (1,2 m): la misma que el piso de la nave. */
export const TRAILER_BED_H = 1.2;

// Paleta: la del archivo más negro de neumático, cristal, faros y luces traseras.
const BLUE = 0x1f3d7a;
const ORANGE = 0xf39200;
const YELLOW = 0xe9c93a;
const DARK = 0x27303f;
const LIGHT = 0xdfe6ee;
const METAL = 0x8a95a8;
const BATTERY = 0x3a4a5c;
const BODY_ERE = 0x2b4f8a;
const TYRE = 0x16191d;
const GLASS = 0x1d2b3a;
const HEAD_LIGHT = 0xfff2c0;
const TAIL_LIGHT = 0xd62828;
const HUB = 0xb9c2cc;
const TROUSER = 0x2e3a4d;
const SHIRT = 0x39517a;
const SKIN = 0xe0b48a;
const REFLECT = 0xf4f7fa;
const RIB = 0xc7d0dc;

// Material y geometría compartidos entre instancias: hay hasta 75 vehículos en escena.
const materials = new Map<number, THREE.MeshLambertMaterial>();
/** Lambert con sombreado plano (presupuesto de la fase 7). Un material por color. */
function shade(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

const geometries = new Map<string, THREE.BufferGeometry>();
/** Geometría que se crea una vez por medidas y se reutiliza en todas las máquinas. */
function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}
const boxGeo = (w: number, h: number, d: number) => shared(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (r: number, h: number, seg: number) => shared(`cyl:${r}:${h}:${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg));
const sphereGeo = (r: number, ws: number, hs: number) => shared(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));

/** Pieza con geometría y material compartidos. Solo el cuerpo y el mástil proyectan sombra. */
function part(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, shadow = false): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, shade(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Rueda con eje en X (el giro de `spinWheels` usa rotation.x). Tapacubos opcional como hijo: gira con la rueda. */
function wheel(r: number, width: number, seg: number, x: number, y: number, z: number, hub = false): THREE.Mesh {
  const w = part(cylGeo(r, width, seg), TYRE, x, y, z);
  w.rotation.z = Math.PI / 2;
  if (hub) w.add(part(cylGeo(r * 0.5, width + 0.02, 6), HUB));
  return w;
}

/** Carretilla retráctil: chasis, mástil triple, jaula del operador con techo, asiento y horquillas. */
export function createReachTruck(): AnimatedMachine {
  const g = group3();

  const chassis = part(boxGeo(0.9, 0.5, 1.4), BLUE, 0, 0.35, 0, true);
  g.add(chassis);
  g.add(part(boxGeo(0.9, 0.9, 0.35), 0x2a3550, 0, 0.5, -0.72));

  // Mástil triple: tres secciones por montante, desplazadas en z para que se vean en vista isométrica.
  const mast = new THREE.Group();
  mast.position.set(0, 0.5, 0.55);
  g.add(mast);
  for (const x of [0, 0.45]) {
    mast.add(part(boxGeo(0.22, 2.6, 0.22), METAL, x, 1.3, 0, true));
    mast.add(part(boxGeo(0.17, 2.0, 0.17), METAL, x, 1.0, 0.14, true));
    mast.add(part(boxGeo(0.12, 1.4, 0.12), METAL, x, 0.7, 0.26, true));
  }

  const forks = new THREE.Group();
  forks.position.set(0.34, 0.2, 0.05);
  mast.add(forks);
  forks.add(part(boxGeo(0.8, 0.9, 0.06), 0x2a3550, 0, 0.45, -0.1));
  forks.add(part(boxGeo(0.08, 0.06, 1.3), METAL, 0.08, 0.03, 0.5));
  forks.add(part(boxGeo(0.08, 0.06, 1.3), METAL, 0.5, 0.03, 0.5));

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0.34, 0.18, 1.0);
  forks.add(palletGrip);

  // Jaula del operador: cuatro montantes y techo de rejilla (sólido en el modelo).
  for (const [x, z] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, -0.75], [0.4, -0.75]] as const) {
    g.add(part(boxGeo(0.05, 1.3, 0.05), METAL, x, 0.95, z));
  }
  g.add(part(boxGeo(0.9, 0.05, 0.6), METAL, 0, 1.6, -0.47));
  g.add(part(boxGeo(0.45, 0.1, 0.45), DARK, 0, 0.78, -0.45));
  g.add(part(boxGeo(0.45, 0.4, 0.06), DARK, 0, 1.0, -0.7));
  g.add(part(boxGeo(0.7, 0.08, 0.6), BATTERY, 0, 0.62, -0.05));

  // Volante inclinado hacia el operador y su columna.
  const wheelBar = part(cylGeo(0.13, 0.02, 6), DARK, 0.2, 1.2, -0.4);
  wheelBar.rotation.x = Math.PI / 2 - 0.5;
  g.add(wheelBar);
  g.add(part(boxGeo(0.04, 0.35, 0.04), METAL, 0.2, 0.95, -0.4));

  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]] as const) {
    const w = wheel(0.14, 0.12, 8, wx, 0.14, wz);
    g.add(w);
    wheels.push(w);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip } };
}

/**
 * Apilador eléctrico Jungheinrich ERE 225i: transpaleta con plataforma baja, mástil corto y operario a pie
 * que lleva el timón. Proporciones de transpaleta eléctrica (no de contrapesada).
 */
export function createErE225i(): AnimatedMachine {
  const g = group3();

  const chassis = part(boxGeo(0.8, 0.3, 1.5), BODY_ERE, 0, 0.2, 0, true);
  g.add(chassis);
  g.add(part(boxGeo(0.74, 0.2, 0.9), BATTERY, 0, 0.4, -0.25));
  // Plataforma plegable donde el operario apoya los pies.
  g.add(part(boxGeo(0.4, 0.05, 0.42), DARK, -0.3, 0.36, -0.45));

  // Mástil corto (a 1,3 m) con dos montantes y travesaño.
  const mast = new THREE.Group();
  mast.position.set(0, 0.3, 0.6);
  g.add(mast);
  mast.add(part(boxGeo(0.08, 1.3, 0.08), METAL, -0.3, 0.65, 0, true));
  mast.add(part(boxGeo(0.08, 1.3, 0.08), METAL, 0.3, 0.65, 0, true));
  mast.add(part(boxGeo(0.7, 0.08, 0.08), METAL, 0, 1.25, 0, true));

  // Horquillas bajas con respaldo de carga: se sitúan a 0,06 m y suben con liftHeight.
  const forks = new THREE.Group();
  forks.position.set(0, 0.06, 0.6);
  g.add(forks);
  forks.add(part(boxGeo(0.07, 0.05, 1.15), METAL, -0.25, 0.0, 0.55));
  forks.add(part(boxGeo(0.07, 0.05, 1.15), METAL, 0.25, 0.0, 0.55));
  forks.add(part(boxGeo(0.6, 0.05, 0.1), METAL, 0, 0.0, 0.05));
  forks.add(part(boxGeo(0.7, 0.5, 0.05), DARK, 0, 0.3, -0.05));

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0, 0.04, 1.0);
  forks.add(palletGrip);

  // Timón con empuñadura.
  const tiller = part(boxGeo(0.05, 0.05, 0.55), METAL, 0.2, 0.75, -0.45);
  tiller.rotation.x = -0.4;
  g.add(tiller);
  g.add(part(boxGeo(0.1, 0.08, 0.12), DARK, 0.2, 0.9, -0.66));

  // Operario a pie, detrás del timón (lateral izquierdo), sobre la plataforma.
  const operator = createWorker();
  operator.group.position.set(-0.3, 0.38, -0.45);
  operator.group.scale.setScalar(0.8);
  g.add(operator.group);

  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.35, 0.5], [0.35, 0.5]] as const) {
    const w = wheel(0.09, 0.08, 8, wx, 0.09, wz);
    g.add(w);
    wheels.push(w);
  }
  // Rueda de tracción trasera (centrada).
  const drive = wheel(0.12, 0.1, 8, 0, 0.12, -0.55);
  g.add(drive);
  wheels.push(drive);

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip, operator: operator.group } };
}

/** Recogepedidos: horquillas largas para 2 palets, plataforma con barandilla y operario de pie. */
export function createOrderPicker(): AnimatedMachine {
  const g = group3();

  const chassis = part(boxGeo(0.95, 0.5, 1.6), BLUE, 0, 0.35, 0, true);
  g.add(chassis);

  // Plataforma a nivel fijo (el picking es solo de suelo) con barandilla.
  g.add(part(boxGeo(1.0, 0.06, 0.7), ORANGE, 0, 0.55, 0.2));
  for (const x of [-0.48, 0.48]) g.add(part(boxGeo(0.04, 0.5, 0.04), METAL, x, 0.8, -0.15));
  g.add(part(boxGeo(0.96, 0.04, 0.04), METAL, 0, 1.05, -0.15));

  // Operario de pie sobre la plataforma.
  const operator = createWorker();
  operator.group.position.set(0, 0.55, 0.75);
  g.add(operator.group);

  // Mástil doble.
  const mast = new THREE.Group();
  g.add(mast);
  mast.add(part(boxGeo(0.06, 1.8, 0.06), METAL, 0.05, 0.9, 0.0, true));
  mast.add(part(boxGeo(0.06, 1.8, 0.06), METAL, 0.6, 0.9, 0.0, true));

  const forks = new THREE.Group();
  forks.position.set(0.33, 0.2, 0.4);
  g.add(forks);
  forks.add(part(boxGeo(0.09, 0.06, 2.0), METAL, 0.1, 0.03, 0.9));
  forks.add(part(boxGeo(0.09, 0.06, 2.0), METAL, 0.55, 0.03, 0.9));

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0.33, 0.18, 1.6);
  forks.add(palletGrip);

  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.45, 0.6], [0.45, 0.6], [-0.45, -0.6], [0.45, -0.6]] as const) {
    const w = wheel(0.13, 0.11, 8, wx, 0.13, wz);
    g.add(w);
    wheels.push(w);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip, operator: operator.group } };
}

/**
 * Tractora + semirremolque de 13,6 m. El semirremolque apoya en la quinta rueda de la tractora (la placa une el
 * chasis de la tractora con el larguero continuo del remolque), así que no hay hueco en la unión ni al atracar.
 */
export function createTruck({ reefer }: { reefer?: boolean } = {}) {
  const g = group3();
  const trailerBody = group3();
  g.add(trailerBody);
  const bedY = TRAILER_BED_H + 1.35;

  // Tractora: cabina con capó, parabrisas, ventanillas, retrovisores, faros, paragolpes, depósito y escape.
  g.add(part(boxGeo(2.2, 2.4, 1.8), 0x0f7bb0, 0, 1.2, -6.2, true));
  g.add(part(boxGeo(2.2, 0.35, 1.8), 0x0b5f8a, 0, 2.7, -6.2));
  const hood = part(boxGeo(2.0, 0.7, 1.6), 0x0f7bb0, 0, 1.0, -8.0, true);
  hood.rotation.x = 0.12;
  g.add(hood);
  const windshield = part(boxGeo(2.0, 1.0, 0.06), GLASS, 0, 1.9, -7.12);
  windshield.rotation.x = -0.25;
  g.add(windshield);
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.04, 0.8, 1.0), GLASS, s * 1.11, 1.9, -6.2));
    g.add(part(boxGeo(0.25, 0.5, 0.06), DARK, s * 1.3, 1.9, -7.0));
    g.add(part(boxGeo(0.4, 0.22, 0.08), HEAD_LIGHT, s * 0.7, 1.35, -7.2));
    g.add(part(boxGeo(0.9, 0.06, 1.8), DARK, s * 1.1, 0.85, -5.5));
  }
  g.add(part(boxGeo(2.2, 0.8, 0.2), 0x2a3550, 0, 1.05, -7.2));
  g.add(part(boxGeo(2.2, 0.9, 0.4), METAL, 0, 2.9, -6.6));
  g.add(part(boxGeo(2.3, 0.25, 0.25), DARK, 0, 0.5, -8.95));
  const tank = part(cylGeo(0.3, 0.9, 8), METAL, 1.25, 0.8, -4.3);
  tank.rotation.z = Math.PI / 2;
  g.add(tank);
  g.add(part(cylGeo(0.07, 1.6, 6), METAL, 1.0, 1.9, -5.0));

  // Chasis de la tractora y quinta rueda.
  g.add(part(boxGeo(2.3, 0.5, 4.5), 0x2a3550, 0, 0.7, -3.4, true));
  g.add(part(boxGeo(1.8, 0.05, 0.8), 0x2a3550, 0, 0.975, -1.6));
  g.add(part(boxGeo(0.4, 0.1, 0.4), 0x2a3550, 0, 1.05, -1.6));

  // Semirremolque 13,6 m: caja de 2,7 m a 1,2 m, larguero continuo, nervios laterales y puertas traseras.
  const trailer = part(boxGeo(2.55, 2.7, 13.6), reefer ? 0xe8eef4 : LIGHT, 0, bedY, 4.8, true);
  trailerBody.add(trailer);
  trailerBody.add(part(boxGeo(2.2, 0.2, 13.6), 0x2a3550, 0, 1.1, 4.8, true));
  trailerBody.add(part(boxGeo(2.0, 0.4, 13.6), 0x2a3550, 0, 0.8, 4.8));
  for (let i = 0; i < 6; i++) {
    const z = -1.0 + i * 2.2;
    for (const s of [-1, 1]) trailerBody.add(part(boxGeo(0.05, 2.5, 0.12), RIB, s * 1.3, bedY, z));
  }
  const doorZ = 4.8 + 6.8 + 0.03;
  for (const s of [-1, 1]) {
    trailerBody.add(part(boxGeo(1.22, 2.5, 0.06), RIB, s * 0.63, bedY, doorZ));
    trailerBody.add(part(boxGeo(0.05, 0.4, 0.05), METAL, s * 0.12, bedY, doorZ + 0.04));
    trailerBody.add(part(boxGeo(0.15, 0.3, 0.05), TAIL_LIGHT, s * 1.1, bedY + 1.2, doorZ + 0.06));
    trailerBody.add(part(boxGeo(0.02, 0.22, 13.2), BLUE, s * 1.28, 1.5, 4.8));
    trailerBody.add(part(boxGeo(0.02, 0.06, 13.2), ORANGE, s * 1.28, 1.7, 4.8));
    // Placa de marca en los laterales (logo ALDI Nord).
    const decal = createBrandDecal(2.2, 2.3);
    decal.position.set(s * 1.3, bedY, 8.6);
    decal.rotation.y = s * (Math.PI / 2);
    trailerBody.add(decal);
    // Pata de apoyo bajo la nariz del remolque.
    g.add(part(cylGeo(0.05, 0.9, 6), METAL, s * 0.9, 0.45, -1.2));
  }

  if (reefer) {
    g.add(part(boxGeo(2.2, 2.4, 0.9), 0xb9c4d2, 0, 1.9, -2.7, true));
    g.add(part(boxGeo(0.7, 0.9, 0.35), 0x4d5b6b, 0, 1.9, -3.15));
    const fan = part(cylGeo(0.3, 0.05, 8), DARK, 0, 1.9, -3.25);
    fan.rotation.x = Math.PI / 2;
    g.add(fan);
  }

  // Ruedas de la tractora y del semirremolque, con tapacubos. Las ruedas no suben: solo la caja.
  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-1.05, -7.0], [1.05, -7.0], [-1.05, -4.0], [1.05, -4.0]] as const) {
    const w = wheel(0.4, 0.35, 10, wx, 0.4, wz, true);
    g.add(w);
    wheels.push(w);
  }
  for (let i = 0; i < 3; i++) {
    for (const s of [-1.05, 1.05]) {
      const w = wheel(0.3, 0.3, 10, s, 0.3, 2.5 + i * 2.2, true);
      g.add(w);
      wheels.push(w);
    }
  }

  return { group: g, nodes: { trailer, trailerBody, wheels } };
}

/** Operario en bloques: piernas, tronco, brazos en pose de conducción, cabeza, chaleco con dos bandas y casco. */
export function createWorker() {
  const g = group3();

  g.add(part(boxGeo(0.14, 0.8, 0.16), TROUSER, -0.11, 0.4, 0));
  g.add(part(boxGeo(0.14, 0.8, 0.16), TROUSER, 0.11, 0.4, 0));
  g.add(part(boxGeo(0.4, 0.5, 0.24), SHIRT, 0, 1.05, 0));
  for (const x of [-0.28, 0.28]) {
    const arm = part(boxGeo(0.12, 0.5, 0.12), SHIRT, x, 1.05, 0.14);
    arm.rotation.x = -0.9;
    g.add(arm);
  }
  g.add(part(sphereGeo(0.13, 5, 4), SKIN, 0, 1.4, 0));
  g.add(part(boxGeo(0.44, 0.42, 0.26), ORANGE, 0, 1.07, 0.01));
  g.add(part(boxGeo(0.45, 0.05, 0.27), REFLECT, 0, 0.98, 0.01));
  g.add(part(boxGeo(0.45, 0.05, 0.27), REFLECT, 0, 1.16, 0.01));
  const helmet = new THREE.Mesh(
    shared('helmet', () => new THREE.SphereGeometry(0.15, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2)),
    shade(YELLOW),
  );
  helmet.position.set(0, 1.5, 0);
  g.add(helmet);

  return { group: g, nodes: {} as Record<string, THREE.Object3D> };
}

/** Palé simulado (caja 1,2 × h × 0,8) suelto, útil para montar carga en modelos. */
export function createPallet(height = 1.2, color = 0xa9875b) {
  const pallet = part(boxGeo(1.2, height, 0.8), color, 0, height / 2, 0, true);
  return pallet;
}

/** Transpaleta eléctrica con plataforma/asiento lateral (ESE): lleva pedidos preparados a los muelles. */
export function createPalletTruck(): AnimatedMachine {
  const g = group3();

  const chassis = part(boxGeo(0.8, 0.4, 1.5), BLUE, 0, 0.3, 0, true);
  g.add(chassis);

  // Asiento con respaldo, timón y cubierta redonda de batería.
  g.add(part(boxGeo(0.45, 0.12, 0.45), DARK, -0.45, 0.62, -0.1));
  g.add(part(boxGeo(0.45, 0.4, 0.06), DARK, -0.45, 0.85, -0.3));
  g.add(part(cylGeo(0.22, 0.06, 8), BATTERY, 0.05, 0.53, 0.2));
  const tiller = part(boxGeo(0.06, 0.06, 0.7), METAL, 0.05, 0.9, -0.55);
  tiller.rotation.x = -0.35;
  g.add(tiller);

  const mast = new THREE.Group();
  g.add(mast);
  mast.add(part(boxGeo(0.12, 1.0, 0.12), METAL, 0.25, 0.85, 0.55, true));

  const forks = new THREE.Group();
  forks.position.set(0.25, 0.15, 0.2);
  g.add(forks);
  forks.add(part(boxGeo(0.07, 0.05, 1.3), METAL, -0.22, 0.03, 0.65));
  forks.add(part(boxGeo(0.07, 0.05, 1.3), METAL, 0.22, 0.03, 0.65));

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0.25, 0.14, 1.2);
  forks.add(palletGrip);

  // Rueda de carga doble bajo cada horquilla.
  const wheels: THREE.Object3D[] = [];
  for (const x of [-0.22, 0.22]) {
    for (const z of [0.4, 0.9]) {
      const w = wheel(0.06, 0.06, 6, x, -0.09, z);
      forks.add(w);
      wheels.push(w);
    }
  }
  // Ruedas de tracción y de apoyo.
  for (const [wx, wz] of [[-0.38, 0.5], [0.38, 0.5], [0, -0.6]] as const) {
    const w = wheel(0.11, 0.1, 8, wx, 0.11, wz);
    g.add(w);
    wheels.push(w);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip } };
}
