/**
 * Paleta, materiales, geometrías y helpers compartidos por los modelos de vehículos y operario.
 * Cada modelo vive en su propio archivo y se re-exporta desde `index.ts`.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { group3 } from '@/three/builders/utils';
import { PALLET_LEN } from '@/lib/sim/handling';

export interface AnimatedMachine {
  group: THREE.Group;
  nodes: {
    /**
     * Horquillas: el origen está en la cara inferior de las puntas y `position.y = FORK_REST + elevación`.
     * El palé trasero va centrado en `slots[0]` (z local) y, si caben dos, el delantero en `slots[1]`.
     */
    forks: THREE.Group;
    mast: THREE.Object3D;
    wheels: THREE.Object3D[];
    body: THREE.Object3D;
    palletGrip: THREE.Group;
    /** Operario a pie o sentado (si lo lleva), para balanceo y cambio de postura. */
    operator?: THREE.Object3D;
    /** Tronco del operario de pie: pivote en la cadera para inclinarse sin sacar los pies de la plataforma. */
    operatorTorso?: THREE.Object3D;
    /** Retráctil: carro del mástil, que avanza hacia el rack (`position.z = reachBase + alcance`). */
    reach?: THREE.Group;
    reachBase?: number;
    /** Mueve las secciones del mástil telescópico a la elevación dada. */
    setLift?: (lift: number) => void;
    /** Centros (z local de `forks`) de los palés en las horquillas. */
    slots: number[];
    /** Otras piezas que se mueven tras crear el modelo (p. ej. secciones del mástil que mueve `setLift`). */
    moving?: THREE.Object3D[];
  };
}

/** Altura local (en `forks`) del centro de un palé apoyado en las horquillas: cara inferior 6,2 cm bajo la chapa. */
export const PALLET_LOCAL_Y = 0.382 - 0.062;
/** Longitud de las horquillas de una sola carga, tándem y triple carga (m). */
export const FORK_LEN_1 = 1.2;
export const FORK_LEN_2 = 2.4;
export const FORK_LEN_3 = 3.6;

/** Cota del piso de la caja del semirremolque sobre el patio (1,2 m): la misma que el piso de la nave. */
export const TRAILER_BED_H = 1.2;

// Paleta: la del archivo más negro de neumático, cristal, faros y luces traseras.
export const BLUE = 0x1f3d7a;
export const ORANGE = 0xf39200;
export const YELLOW = 0xe9c93a;
export const DARK = 0x27303f;
export const LIGHT = 0xdfe6ee;
export const METAL = 0x8a95a8;
// Colores característicos de Jungheinrich (ESE 533)
export const JH_YELLOW = 0xf5a800; // Amarillo melón / ámbar icónico Jungheinrich
export const JH_GREY = 0x383e48;   // Gris antracita de faldón, base y peldaño
export const JH_TEAL = 0x00a896;   // Distintivo turquesa de modelo ESE 533
export const JH_RED = 0xd62828;    // Rojo flecha Jungheinrich y seta de emergencia
export const TYRE = 0x16191d;
export const GLASS = 0x1d2b3a;
export const HEAD_LIGHT = 0xfff2c0;
export const TAIL_LIGHT = 0xd62828;
export const HUB = 0xb9c2cc;
export const TROUSER = 0x2e3a4d;
export const SHIRT = 0x39517a;
export const SKIN = 0xe0b48a;
export const REFLECT = 0xf4f7fa;
export const RIB = 0xc7d0dc;

// Material y geometría compartidos entre instancias: hay hasta 75 vehículos en escena.
export const materials = new Map<number, THREE.MeshLambertMaterial>();
/** Lambert con sombreado plano (presupuesto de la fase 7). Un material por color. */
export function shade(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

export const geometries = new Map<string, THREE.BufferGeometry>();
/** Geometría que se crea una vez por medidas y se reutiliza en todas las máquinas. */
export function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = make();
    geometries.set(key, g);
  }
  return g;
}
/**
 * Caja. Las piezas grandes (carrocería, capós, cabinas, remolques) llevan aristas biseladas de un solo segmento:
 * dan volumen y el aspecto de low poly moderno sin disparar los triángulos. Las piezas finas siguen siendo cajas.
 */
export const boxGeo = (w: number, h: number, d: number) => {
  const m = Math.min(w, h, d);
  if (m < 0.12) return shared(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  const r = Math.min(0.05, m * 0.3);
  return shared(`rbox:${w}:${h}:${d}:${r}`, () => new RoundedBoxGeometry(w, h, d, 1, r));
};
export const cylGeo = (r: number, h: number, seg: number) => shared(`cyl:${r}:${h}:${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg));
export const sphereGeo = (r: number, ws: number, hs: number) => shared(`sph:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));

/** Pieza con geometría y material compartidos. Solo el cuerpo y el mástil proyectan sombra. */
export function part(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, shadow = false): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, shade(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Rueda con eje en X (el giro de `spinWheels` usa rotation.x). Tapacubos opcional como hijo: gira con la rueda. */
export function wheel(r: number, width: number, seg: number, x: number, y: number, z: number, hub = false): THREE.Mesh {
  const w = part(cylGeo(r, width, seg), TYRE, x, y, z);
  w.rotation.z = Math.PI / 2;
  if (hub) w.add(part(cylGeo(r * 0.5, width + 0.02, 6), HUB));
  return w;
}

/** Juego de horquillas: dos palas desde z = 0,05 hasta 0,05 + len, talón, respaldo de carga y centros de los palés. */
export function forkSet(len: number, backH: number, frameColor: number): { group: THREE.Group; slots: number[] } {
  const f = group3();
  for (const x of [-0.2, 0.2]) {
    f.add(part(boxGeo(0.1, 0.06, len), METAL, x, 0.03, 0.05 + len / 2));
    // Punta achaflanada y talón reforzado.
    f.add(part(boxGeo(0.1, 0.03, 0.18), METAL, x, 0.015, 0.05 + len - 0.09));
    f.add(part(boxGeo(0.12, 0.12, 0.14), METAL, x, 0.08, 0.1));
  }
  f.add(part(boxGeo(0.84, backH, 0.05), frameColor, 0, backH / 2 + 0.06, 0));
  for (const y of [0.25, backH - 0.05]) f.add(part(boxGeo(0.86, 0.05, 0.07), METAL, 0, y, 0));
  const slots =
    len > 2.8
      ? [0.65, 0.65 + PALLET_LEN, 0.65 + 2 * PALLET_LEN]
      : len > 1.5
        ? [0.65, 0.65 + PALLET_LEN]
        : [0.65];
  return { group: f, slots };
}
