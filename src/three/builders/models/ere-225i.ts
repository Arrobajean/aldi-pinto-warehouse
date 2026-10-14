import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { CARRY_CENTER, FORK_REST } from '@/lib/sim/handling';
import type { AnimatedMachine } from './shared';
import { FORK_LEN_2, DARK, METAL, JH_YELLOW, JH_GREY, JH_TEAL, JH_RED, TYRE, HEAD_LIGHT, TAIL_LIGHT, REFLECT, boxGeo, cylGeo, part, wheel, forkSet } from './shared';
import { createWorker } from './worker';

/**
 * Transpaleta eléctrica con plataforma abatible Jungheinrich ERE 225i: operaciones de carga/descarga rápida
 * en muelles y traslados horizontales. Carrocería compacta en amarillo melón Jungheinrich (JH_YELLOW), faldón
 * inferior en gris antracita (JH_GREY), paragolpes delantero con pernos, logotipo Jungheinrich con flecha roja,
 * placa distintiva turquesa "ERE 225i", plataforma del operario suspendida y abatible con alfombrilla de goma,
 * barandillas laterales de protección abatibles acolchadas, timón multifunción ergonómico con botón de seguridad
 * ventral rojo, mástil y horquillas tándem de 2,4 m con rodillos dobles de carga.
 */
export function createErE225i(): AnimatedMachine {
  const g = group3();

  // 1. Chasis base y faldón inferior en gris antracita (JH_GREY)
  const chassis = part(boxGeo(0.84, 0.26, 0.98), JH_GREY, 0, 0.15, 0.05, true);
  g.add(chassis);

  // Paragolpes delantero envolvente con pernos de acero
  g.add(part(boxGeo(0.88, 0.16, 0.12), TYRE, 0, 0.15, -0.47));
  for (const x of [-0.34, 0, 0.34]) {
    const bolt = part(cylGeo(0.016, 0.02, 6), METAL, x, 0.15, -0.54);
    bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }

  // 2. Capó motriz envolvente en amarillo icónico Jungheinrich (JH_YELLOW)
  g.add(part(boxGeo(0.82, 0.44, 0.88), JH_YELLOW, 0, 0.36, 0.06, true));
  g.add(part(boxGeo(0.74, 0.1, 0.72), JH_GREY, 0, 0.62, 0.08));

  // Rejilla frontal de ventilación
  g.add(part(boxGeo(0.42, 0.12, 0.03), DARK, 0, 0.38, -0.42));
  for (const y of [0.34, 0.38, 0.42]) {
    g.add(part(boxGeo(0.38, 0.02, 0.04), JH_GREY, 0, y, -0.42));
  }

  // Logotipo Jungheinrich con franja negra, trazo amarillo y flecha roja
  g.add(part(boxGeo(0.48, 0.08, 0.03), DARK, 0, 0.52, -0.41));
  g.add(part(boxGeo(0.32, 0.035, 0.04), JH_YELLOW, -0.04, 0.52, -0.41));
  g.add(part(boxGeo(0.05, 0.05, 0.04), JH_RED, 0.18, 0.52, -0.41));

  // Placa distintiva turquesa con código de modelo "ERE 225i"
  g.add(part(boxGeo(0.26, 0.06, 0.03), JH_TEAL, 0, 0.25, -0.42));
  g.add(part(boxGeo(0.2, 0.025, 0.04), REFLECT, 0, 0.25, -0.42));

  // 3. Plataforma suspendida abatible para el operario y barandillas laterales de protección
  g.add(part(boxGeo(0.56, 0.09, 0.52), JH_GREY, 0, 0.14, -0.76));
  g.add(part(boxGeo(0.52, 0.03, 0.48), DARK, 0, 0.19, -0.76));

  // Barandillas laterales de protección abatibles acolchadas en amarillo Jungheinrich y negro
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.04, 0.06, 0.55), JH_YELLOW, s * 0.34, 0.95, -0.74));
    g.add(part(boxGeo(0.06, 0.1, 0.48), DARK, s * 0.34, 0.95, -0.74));
    g.add(part(boxGeo(0.05, 0.65, 0.05), JH_GREY, s * 0.34, 0.62, -0.46));
  }
  g.add(part(boxGeo(0.48, 0.24, 0.06), DARK, 0, 0.72, -0.4));

  // 4. Timón ergonómico de control con cabezal multifunción
  const arm = part(boxGeo(0.06, 0.06, 0.72), JH_GREY, 0.18, 0.82, -0.5);
  arm.rotation.x = -0.65;
  g.add(arm);
  g.add(part(boxGeo(0.36, 0.08, 0.09), DARK, 0.18, 1.08, -0.75));
  g.add(part(boxGeo(0.12, 0.06, 0.04), JH_RED, 0.18, 1.1, -0.8));
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.04, 0.05, 0.04), JH_YELLOW, 0.18 + s * 0.12, 1.1, -0.72));
  }
  // Faros de trabajo bajo la rejilla frontal y pilotos traseros.
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.1, 0.05, 0.03), HEAD_LIGHT, s * 0.3, 0.3, -0.44));
    g.add(part(boxGeo(0.1, 0.05, 0.03), TAIL_LIGHT, s * 0.3, 0.3, 0.52));
  }

  const operator = createWorker();
  operator.group.position.set(0, 0.18, -0.76);
  g.add(operator.group);

  // 5. Mástil y horquillas tándem de 2,4 m (capacidad 2 europalés)
  const mast = new THREE.Group();
  g.add(mast);

  const set = forkSet(FORK_LEN_2, 0.72, 0x2a3550);
  const forks = set.group;
  forks.position.set(0, FORK_REST, CARRY_CENTER.frontal - 0.65);
  g.add(forks);

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0, 0.04, set.slots[0]);
  forks.add(palletGrip);

  // 6. Rodaje: rueda motriz con tracción amortiguada y ruedas pivotantes estabilizadoras
  const wheels: THREE.Object3D[] = [];
  const drive = wheel(0.13, 0.11, 8, 0, 0.13, -0.2, true);
  g.add(drive);
  wheels.push(drive);
  for (const x of [-0.37, 0.37]) {
    const w = wheel(0.06, 0.06, 6, x, 0.06, -0.38);
    g.add(w);
    wheels.push(w);
  }
  for (const x of [-0.2, 0.2]) {
    const w1 = wheel(0.042, 0.07, 6, x, 0.0, FORK_LEN_2 - 0.1);
    w1.userData.isLoadRoller = true;
    forks.add(w1);
    wheels.push(w1);

    const w2 = wheel(0.042, 0.07, 6, x, 0.0, FORK_LEN_2 - 0.24);
    w2.userData.isLoadRoller = true;
    forks.add(w2);
    wheels.push(w2);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip, operator: operator.group, slots: set.slots } };
}
