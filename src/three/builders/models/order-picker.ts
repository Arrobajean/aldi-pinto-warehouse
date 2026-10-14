import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { CARRY_CENTER, FORK_REST } from '@/lib/sim/handling';
import type { AnimatedMachine } from './shared';
import { FORK_LEN_2, YELLOW, DARK, METAL, JH_YELLOW, JH_GREY, JH_TEAL, JH_RED, TYRE, GLASS, HEAD_LIGHT, TAIL_LIGHT, boxGeo, cylGeo, part, wheel, forkSet } from './shared';
import { GRIP_HAND, createWorker } from './worker';

/** Posición del operario de pie en la plataforma trasera (sistema del recogepedidos). */
const OPERATOR_AT = { x: 0, y: 0.21, z: -0.86 };
/** Montantes del mástil (z) y su anchura (x): en la cara delantera, detrás de las horquillas. */
const MAST_Z = 0.42;
const MAST_X = 0.34;

/**
 * Recogepedidos horizontal Jungheinrich ECD 320 (modelo de la tarjeta de máquina, según la referencia visual):
 * dos palés con horquillas de 2,4 m, mástil de montantes amarillos y carro de elevación. Carrocería amarillo melón
 * (JH_YELLOW) con faldones laterales y faldón gris antracita; morro con faros; logotipo de marca con flecha roja y
 * placa turquesa de modelo. Plataforma del operario en la parte trasera, a 12 cm del suelo, con guarda amarilla y
 * timón JetPilot. El operario va de pie en la plataforma mirando hacia donde avanza: con las horquillas detrás al
 * circular y delante al manipular. Timón y operario giran juntos (ver `entity-sync.ts`). Las dimensiones de transporte
 * son las de la ficha de referencia.
 */
export function createOrderPicker(): AnimatedMachine {
  const g = group3();

  // Chasis bajo y faldón gris antracita, con paragolpes de goma y pernos en la parte trasera.
  const chassis = part(boxGeo(0.82, 0.2, 1.0), JH_GREY, 0, 0.13, -0.2, true);
  g.add(chassis);
  g.add(part(boxGeo(0.84, 0.16, 0.12), TYRE, 0, 0.14, -0.72));
  for (const x of [-0.3, 0.3]) {
    const bolt = part(cylGeo(0.016, 0.02, 6), METAL, x, 0.14, -0.79);
    bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }

  // Cuerpo motriz amarillo melón: ventilación, placa de modelo y faldones laterales con franja gris.
  g.add(part(boxGeo(0.8, 0.36, 0.5), JH_YELLOW, 0, 0.36, -0.36, true));
  g.add(part(boxGeo(0.74, 0.07, 0.46), JH_GREY, 0, 0.56, -0.36));
  for (const y of [0.3, 0.34, 0.38]) g.add(part(boxGeo(0.36, 0.02, 0.04), JH_GREY, 0, y, -0.62));
  g.add(part(boxGeo(0.26, 0.06, 0.03), JH_TEAL, 0, 0.22, -0.62));
  g.add(part(boxGeo(0.055, 0.055, 0.04), JH_RED, 0.2, 0.44, -0.62));
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.02, 0.26, 0.4), JH_YELLOW, s * 0.415, 0.4, -0.36));
    g.add(part(boxGeo(0.025, 0.04, 0.42), JH_GREY, s * 0.415, 0.23, -0.36));
    // Logotipo lateral (banda oscura y flecha roja) y placa turquesa con el modelo.
    g.add(part(boxGeo(0.025, 0.05, 0.2), DARK, s * 0.425, 0.48, -0.36));
    g.add(part(boxGeo(0.025, 0.03, 0.04), JH_RED, s * 0.425, 0.48, -0.25));
    g.add(part(boxGeo(0.025, 0.05, 0.12), JH_TEAL, s * 0.425, 0.32, -0.36));
  }

  // Morro frontal con barra de faros y pilotos de posición.
  g.add(part(boxGeo(0.72, 0.2, 0.36), JH_YELLOW, 0, 0.3, 0.02, true));
  g.add(part(boxGeo(0.62, 0.03, 0.03), HEAD_LIGHT, 0, 0.42, 0.21));
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.1, 0.05, 0.03), HEAD_LIGHT, s * 0.3, 0.22, 0.32));
    g.add(part(boxGeo(0.1, 0.05, 0.03), TAIL_LIGHT, s * 0.3, 0.3, -0.73));
  }

  // Plataforma del operario (12 cm) con alfombrilla antideslizante y peldaños laterales.
  g.add(part(boxGeo(0.78, 0.12, 0.42), JH_GREY, 0, 0.14, -0.86));
  g.add(part(boxGeo(0.74, 0.03, 0.38), DARK, 0, 0.205, -0.86));
  for (const s of [-1, 1]) g.add(part(boxGeo(0.05, 0.02, 0.3), METAL, s * 0.41, 0.1, -0.86));

  // Guarda trasera amarilla: dos postes en los extremos de la plataforma, travesaño a la altura del pecho y baliza.
  for (const x of [-0.36, 0.36]) g.add(part(boxGeo(0.05, 1.1, 0.05), YELLOW, x, 0.77, -1.0));
  g.add(part(boxGeo(0.77, 0.05, 0.05), YELLOW, 0, 1.32, -1.0));
  g.add(part(cylGeo(0.04, 0.06, 6), YELLOW, 0.36, 1.35, -1.0));

  // Mástil: montantes amarillos en la cara delantera, travesaños y rejilla de protección de carga (altura 1,32 m).
  for (const x of [-MAST_X, MAST_X]) g.add(part(boxGeo(0.07, 1.42, 0.07), YELLOW, x, 0.81, MAST_Z, true));
  g.add(part(boxGeo(0.8, 0.06, 0.07), YELLOW, 0, 1.53, MAST_Z, true));
  g.add(part(boxGeo(0.8, 0.05, 0.05), YELLOW, 0, 0.62, MAST_Z));
  for (const x of [-0.36, 0.36]) g.add(part(boxGeo(0.05, 1.12, 0.05), DARK, x, 0.76, MAST_Z));
  g.add(part(boxGeo(0.78, 0.05, 0.05), DARK, 0, 1.3, MAST_Z));
  for (const y of [0.5, 0.85, 1.12]) g.add(part(boxGeo(0.7, 0.025, 0.025), METAL, 0, y, MAST_Z));
  // Baliza ámbar delantera sobre el travesaño superior.
  g.add(part(cylGeo(0.04, 0.06, 6), YELLOW, 0, 1.6, MAST_Z));

  // Operario de pie sobre la plataforma, con el brazo derecho en el timón.
  const operator = createWorker({ gripRight: true });
  operator.group.position.set(OPERATOR_AT.x, OPERATOR_AT.y, OPERATOR_AT.z);
  g.add(operator.group);

  // Timón JetPilot: columna desde la plataforma hasta la empuñadura, con tapa turquesa y pulsador de marcha. Cuelga del
  // operario: gira con él (mira hacia donde va) y la mano siempre llega a la empuñadura.
  const steer = operator.group;
  steer.add(part(boxGeo(0.05, GRIP_HAND.y, 0.05), JH_GREY, GRIP_HAND.x, GRIP_HAND.y / 2, GRIP_HAND.z));
  steer.add(part(boxGeo(0.12, 0.08, 0.2), DARK, GRIP_HAND.x, GRIP_HAND.y, GRIP_HAND.z));
  steer.add(part(boxGeo(0.12, 0.02, 0.2), JH_TEAL, GRIP_HAND.x, GRIP_HAND.y + 0.05, GRIP_HAND.z));
  steer.add(part(cylGeo(0.02, 0.03, 6), JH_RED, GRIP_HAND.x, GRIP_HAND.y + 0.065, GRIP_HAND.z + 0.05));
  steer.add(part(boxGeo(0.1, 0.05, 0.02), GLASS, GRIP_HAND.x, GRIP_HAND.y + 0.04, GRIP_HAND.z - 0.1));

  // Carro de horquillas de 2,4 m (capacidad 2 europalés); sube y baja con el mástil.
  const mast = new THREE.Group();
  g.add(mast);

  const set = forkSet(FORK_LEN_2, 0.78, 0x2a3550);
  const forks = set.group;
  forks.position.set(0, FORK_REST, CARRY_CENTER.recogepedidos - 0.65);
  g.add(forks);

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0, 0.04, set.slots[0]);
  forks.add(palletGrip);

  // Rodaje: rueda motriz bajo el cuerpo y ruedas estabilizadoras; rodillos de carga en las puntas de las horquillas.
  const wheels: THREE.Object3D[] = [];
  const drive = wheel(0.15, 0.12, 8, 0, 0.15, -0.5, true);
  g.add(drive);
  wheels.push(drive);
  for (const x of [-0.34, 0.34]) {
    const w = wheel(0.07, 0.07, 6, x, 0.07, -0.26);
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

  return {
    group: g,
    nodes: {
      forks,
      mast,
      wheels,
      body: chassis,
      palletGrip,
      operator: operator.group,
      operatorTorso: operator.nodes.torso,
      slots: set.slots,
    },
  };
}
