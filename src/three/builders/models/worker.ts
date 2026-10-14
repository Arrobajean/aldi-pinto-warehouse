import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { ORANGE, YELLOW, DARK, TYRE, TROUSER, SHIRT, SKIN, REFLECT, shade, shared, boxGeo, cylGeo, sphereGeo, part } from './shared';

/** Altura de la cadera (m) del operario de pie: eje del tronco, para inclinarse desde la cintura. */
const HIP = 0.85;
/** Hombro (borde superior del brazo, m, sistema del operario) y brazo derecho adelantado para agarrar el timón (rad). */
const SHOULDER_Y = 1.28;
const GRIP_ARM_PITCH = -0.4;
/** Punto donde la mano del brazo adelantado agarra el timón, en el sistema del operario (z hacia delante). */
export const GRIP_HAND = { x: 0.26, y: SHOULDER_Y - 0.52 * Math.cos(GRIP_ARM_PITCH), z: -0.52 * Math.sin(GRIP_ARM_PITCH) };

/**
 * Operario en bloques. Proporciones de persona (≈ 1,72 m de pie): piernas con bota, cinturón, tronco con chaleco
 * de alta visibilidad y dos bandas reflectantes, brazos con manga y mano, cuello, cabeza y casco con ala.
 * De pie, el tronco (chaleco, brazos y cabeza) cuelga de un pivote en la cadera (`nodes.torso`): al inclinarse se
 * mueve la parte de arriba y los pies se quedan en la plataforma. `gripRight` adelanta el brazo derecho hacia el timón.
 * Sentado (origen en la cara superior del asiento): muslos horizontales, piernas colgando y tronco erguido.
 */
export function createWorker({ seated = false, gripRight = false }: { seated?: boolean; gripRight?: boolean } = {}) {
  const g = group3();
  const helmetGeo = shared('helmet', () => new THREE.SphereGeometry(0.155, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));

  /** Cabeza con cuello, casco y ala delantera en `host`; `top` es la cota del cuello. */
  const head = (host: THREE.Group, top: number) => {
    host.add(part(cylGeo(0.055, 0.09, 6), SKIN, 0, top + 0.045, 0));
    host.add(part(sphereGeo(0.125, 6, 5), SKIN, 0, top + 0.19, 0));
    const helmet = new THREE.Mesh(helmetGeo, shade(YELLOW));
    helmet.position.set(0, top + 0.27, 0);
    helmet.castShadow = true;
    host.add(helmet);
    host.add(part(boxGeo(0.26, 0.025, 0.12), YELLOW, 0, top + 0.27, 0.13, true));
  };

  /** Chaleco de alta visibilidad con dos bandas reflectantes, alrededor de un tronco de `h` de alto en `y` (en `host`). */
  const vest = (host: THREE.Group, y: number, h: number) => {
    host.add(part(boxGeo(0.4, h, 0.25), ORANGE, 0, y, 0.005, true));
    for (const dy of [-h * 0.18, h * 0.12]) host.add(part(boxGeo(0.42, 0.045, 0.265), REFLECT, 0, y + dy, 0.005));
  };

  if (seated) {
    // Muslos sobre el asiento, piernas colgando y botas.
    for (const x of [-0.1, 0.1]) {
      g.add(part(boxGeo(0.15, 0.15, 0.44), TROUSER, x, 0.07, 0.2));
      g.add(part(boxGeo(0.14, 0.5, 0.14), TROUSER, x, -0.18, 0.42));
      g.add(part(boxGeo(0.15, 0.09, 0.26), TYRE, x, -0.46, 0.5));
    }
    g.add(part(boxGeo(0.4, 0.1, 0.26), DARK, 0, 0.13, 0.02));
    // Tronco erguido con chaleco; brazos doblados hacia delante (manos sobre el volante).
    g.add(part(boxGeo(0.36, 0.5, 0.22), SHIRT, 0, 0.4, 0));
    vest(g, 0.4, 0.44);
    for (const x of [-0.25, 0.25]) {
      const arm = part(boxGeo(0.11, 0.46, 0.11), SHIRT, x, 0.42, 0.13);
      arm.rotation.x = -1.1;
      g.add(arm);
      const hand = part(sphereGeo(0.05, 5, 4), SKIN, x * 0.9, 0.5, 0.36);
      g.add(hand);
    }
    head(g, 0.6);
    return { group: g, nodes: {} as Record<string, THREE.Object3D> };
  }

  // De pie: piernas con bota y cinturón en el suelo; tronco, brazos y cabeza cuelgan del pivote de cadera.
  for (const x of [-0.1, 0.1]) {
    g.add(part(boxGeo(0.15, 0.7, 0.16), TROUSER, x, 0.44, 0));
    g.add(part(boxGeo(0.16, 0.1, 0.26), TYRE, x, 0.05, 0.03));
  }
  g.add(part(boxGeo(0.38, 0.1, 0.24), DARK, 0, HIP, 0));
  const torso = group3();
  torso.position.y = HIP;
  g.add(torso);
  // Cotas dentro del pivote: se restan la cadera.
  torso.add(part(boxGeo(0.36, 0.5, 0.22), SHIRT, 0, 1.1 - HIP, 0));
  vest(torso, 1.1 - HIP, 0.46);
  for (const x of [-0.26, 0.26]) {
    if (gripRight && x > 0) {
      // Brazo adelantado: gira desde el hombro (no desde su centro) para que la mano llegue al timón.
      const shoulder = group3();
      shoulder.position.set(x, SHOULDER_Y - HIP, 0);
      shoulder.rotation.x = GRIP_ARM_PITCH;
      shoulder.add(part(boxGeo(0.11, 0.52, 0.11), SHIRT, 0, -0.26, 0));
      torso.add(shoulder);
      torso.add(part(sphereGeo(0.045, 5, 4), SKIN, x, GRIP_HAND.y - HIP, GRIP_HAND.z));
    } else {
      const arm = part(boxGeo(0.11, 0.52, 0.11), SHIRT, x, 1.02 - HIP, 0);
      arm.rotation.x = -0.12;
      arm.rotation.z = x > 0 ? -0.06 : 0.06;
      torso.add(arm);
      torso.add(part(sphereGeo(0.045, 5, 4), SKIN, x * 1.03, 0.72 - HIP, 0.02));
    }
  }
  head(torso, 1.33 - HIP);

  return { group: g, nodes: { torso } as Record<string, THREE.Object3D> };
}
