import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { CARRY_CENTER, FORK_REST } from '@/lib/sim/handling';
import type { AnimatedMachine } from './shared';
import { FORK_LEN_3, YELLOW, DARK, METAL, JH_YELLOW, JH_GREY, JH_TEAL, JH_RED, TYRE, GLASS, HEAD_LIGHT, TAIL_LIGHT, REFLECT, boxGeo, cylGeo, part, wheel, forkSet } from './shared';
import { createWorker } from './worker';

/**
 * Transpaleta eléctrica Jungheinrich ESE 533 con plataforma/asiento lateral: transporte pesado de palés
 * entre flejadoras/playas y muelles. Lleva horquillas extra-largas de 3,6 m capaces de cargar 3 europalés en
 * tándem simultáneamente. Carrocería envolvente amarillo melón Jungheinrich, faldón gris antracita con peldaño,
 * paragolpes con pernos, rejilla de ventilación, distintivo turquesa ESE 533, flecha roja de marca, puesto de
 * conducción lateral con timón ergonómico, respaldo alto de rejilla y rodillos dobles de carga en tándem.
 */
export function createPalletTruck(): AnimatedMachine {
  const g = group3();

  // 1. Chasis base y faldón inferior en gris antracita (JH_GREY)
  const chassis = part(boxGeo(0.92, 0.28, 1.65), JH_GREY, 0, 0.17, -0.28, true);
  g.add(chassis);

  // Paragolpes delantero envolvente de goma negra con pernos de fijación
  g.add(part(boxGeo(0.96, 0.18, 0.14), TYRE, 0, 0.16, -1.13));
  for (const x of [-0.38, -0.14, 0.14, 0.38]) {
    const bolt = part(cylGeo(0.018, 0.02, 6), METAL, x, 0.16, -1.21);
    bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }

  // Peldaño rebajado de embarque lateral en el lado de acceso (x = -0.43)
  g.add(part(boxGeo(0.18, 0.1, 0.52), JH_GREY, -0.43, 0.14, -0.35));
  g.add(part(boxGeo(0.16, 0.02, 0.48), METAL, -0.43, 0.19, -0.35));

  // 2. Capó frontal y cubierta envolvente en amarillo icónico Jungheinrich (JH_YELLOW)
  g.add(part(boxGeo(0.88, 0.68, 0.62), JH_YELLOW, 0, 0.58, -0.8, true));
  g.add(part(boxGeo(0.86, 0.5, 0.18), JH_YELLOW, 0, 0.48, -1.06, true));

  // Ranuras de ventilación frontales del motor
  g.add(part(boxGeo(0.48, 0.16, 0.03), DARK, 0, 0.52, -1.16));
  for (const y of [0.46, 0.5, 0.54]) {
    g.add(part(boxGeo(0.44, 0.02, 0.04), JH_GREY, 0, y, -1.16));
  }

  // Logotipo frontal Jungheinrich con franja negra, trazo amarillo y flecha roja
  g.add(part(boxGeo(0.55, 0.09, 0.03), DARK, 0, 0.74, -1.12));
  g.add(part(boxGeo(0.38, 0.04, 0.04), JH_YELLOW, -0.04, 0.74, -1.12));
  g.add(part(boxGeo(0.055, 0.055, 0.04), JH_RED, 0.2, 0.74, -1.12));

  // Placa distintiva turquesa con código de modelo "ESE 533"
  g.add(part(boxGeo(0.3, 0.07, 0.03), JH_TEAL, 0, 0.38, -1.16));
  g.add(part(boxGeo(0.24, 0.03, 0.04), REFLECT, 0, 0.38, -1.16));

  // Panel lateral cerrado exterior elevado (lado derecho, x = +0.42) con asidero/cierre embutido
  g.add(part(boxGeo(0.08, 0.95, 0.9), JH_YELLOW, 0.42, 0.95, -0.32, true));
  g.add(part(boxGeo(0.1, 0.05, 0.88), JH_GREY, 0.42, 1.45, -0.32));
  g.add(part(boxGeo(0.04, 0.14, 0.2), DARK, 0.47, 1.05, -0.32));

  // Barrera de cintura / puerta de seguridad en el acceso izquierdo
  g.add(part(boxGeo(0.04, 0.38, 0.48), JH_YELLOW, -0.44, 0.82, -0.35));

  // 3. Cabina interior y puesto de conducción lateral ELEVADO
  // Plataforma elevada del piso y alfombrilla engomada antideslizante
  g.add(part(boxGeo(0.68, 0.2, 0.72), JH_GREY, -0.05, 0.35, -0.32));
  g.add(part(boxGeo(0.66, 0.03, 0.7), DARK, -0.05, 0.455, -0.32));

  // Asiento ergonómico lateral en posición elevada con pedestal, cojín acolchado y respaldo alto
  g.add(part(boxGeo(0.38, 0.42, 0.42), JH_GREY, 0.22, 0.65, -0.35));
  g.add(part(boxGeo(0.36, 0.1, 0.4), DARK, 0.22, 0.88, -0.35));
  g.add(part(boxGeo(0.08, 0.65, 0.42), DARK, 0.36, 1.22, -0.35));
  g.add(part(boxGeo(0.3, 0.08, 0.09), DARK, 0.2, 1.06, -0.15));

  // Operario sentado lateralmente con altura elevada para dominio visual sobre la carga
  const operatorAnchor = group3();
  operatorAnchor.position.set(0.18, 0.92, -0.35);
  operatorAnchor.rotation.y = -Math.PI / 2;
  const operator = createWorker({ seated: true });
  operatorAnchor.add(operator.group);
  g.add(operatorAnchor);

  // Consola de control elevada con timón ergonómico, pantalla digital y pulsador de emergencia
  g.add(part(boxGeo(0.26, 0.68, 0.24), JH_GREY, -0.12, 0.76, -0.62));
  g.add(part(boxGeo(0.28, 0.18, 0.26), DARK, -0.12, 1.14, -0.58));
  const tillerKnob = part(cylGeo(0.08, 0.025, 8), DARK, -0.12, 1.25, -0.5);
  tillerKnob.rotation.x = 0.5;
  g.add(tillerKnob);
  g.add(part(boxGeo(0.12, 0.06, 0.02), GLASS, -0.12, 1.25, -0.62));
  g.add(part(cylGeo(0.025, 0.035, 6), JH_RED, -0.22, 1.24, -0.54));

  // Rejilla metálica protectora de carga alta (z = 0.50) hasta cota 1,90 m para proteger al conductor elevado
  for (const x of [-0.42, 0.42]) {
    g.add(part(boxGeo(0.06, 1.45, 0.06), 0x2a3550, x, 1.15, 0.5));
  }
  g.add(part(boxGeo(0.9, 0.06, 0.06), 0x2a3550, 0, 1.9, 0.5));
  for (const y of [0.65, 0.95, 1.25, 1.55, 1.8]) {
    g.add(part(boxGeo(0.86, 0.03, 0.03), METAL, 0, y, 0.5));
  }

  // Luz rotativa ámbar de advertencia en mástil posterior a cota alta (1,85 m)
  g.add(part(boxGeo(0.03, 0.55, 0.03), METAL, 0.42, 1.55, -0.8));
  g.add(part(cylGeo(0.05, 0.09, 6), YELLOW, 0.42, 1.85, -0.8));
  // Faros delanteros y pilotos traseros.
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.12, 0.06, 0.04), HEAD_LIGHT, s * 0.3, 0.42, -1.15));
    g.add(part(boxGeo(0.12, 0.06, 0.04), TAIL_LIGHT, s * 0.3, 0.42, 0.52));
  }

  // 4. Rodaje: rueda motriz central y 4 ruedas de apoyo/estabilizadoras
  const wheels: THREE.Object3D[] = [];
  const drive = wheel(0.15, 0.13, 8, 0, 0.15, -0.75, true);
  g.add(drive);
  wheels.push(drive);
  for (const x of [-0.38, 0.38]) {
    const wFront = wheel(0.065, 0.07, 6, x, 0.065, -0.85);
    const wRear = wheel(0.065, 0.07, 6, x, 0.065, 0.2);
    g.add(wFront, wRear);
    wheels.push(wFront, wRear);
  }

  // 5. Horquillas extra-largas de 3,6 m (3 europalés en tándem) con rodillos tándem de carga
  const mast = new THREE.Group();
  g.add(mast);

  const set = forkSet(FORK_LEN_3, 0.85, 0x2a3550);
  const forks = set.group;
  forks.position.set(0, FORK_REST, CARRY_CENTER.transpaleta - 0.65);
  g.add(forks);

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0, 0.04, set.slots[0]);
  forks.add(palletGrip);

  // Rodillos de carga dobles en tándem en la punta de cada pala: descienden al elevar las horquillas
  for (const x of [-0.2, 0.2]) {
    const wTip = wheel(0.045, 0.07, 6, x, 0.0, FORK_LEN_3 - 0.1);
    wTip.userData.isLoadRoller = true;
    forks.add(wTip);
    wheels.push(wTip);

    const wTandem = wheel(0.045, 0.07, 6, x, 0.0, FORK_LEN_3 - 0.24);
    wTandem.userData.isLoadRoller = true;
    forks.add(wTandem);
    wheels.push(wTandem);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip, operator: operator.group, slots: set.slots } };
}
