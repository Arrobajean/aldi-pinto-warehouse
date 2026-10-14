import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { CARRY_CENTER, FORK_REST } from '@/lib/sim/handling';
import type { AnimatedMachine } from './shared';
import { FORK_LEN_1, YELLOW, DARK, METAL, JH_YELLOW, JH_GREY, JH_TEAL, JH_RED, TYRE, GLASS, HEAD_LIGHT, TAIL_LIGHT, REFLECT, boxGeo, cylGeo, sphereGeo, part, wheel, forkSet } from './shared';
import { createWorker } from './worker';

/**
 * Carretilla elevadora retráctil Jungheinrich ETV 216: apilado y reposición en altura (racks hasta 10 m).
 * Chasis compacto y robusto en amarillo melón Jungheinrich (JH_YELLOW), faldón inferior y paragolpes en
 * gris antracita (JH_GREY) con pernos de acero, logotipo de marca con flecha roja, placa identificativa
 * turquesa "ETV 216", patas de soporte (outriggers) con guías de rodadura de acero para el avance del carro,
 * cabina ergonómica con puesto de conducción transversal (lateral), asiento con suspensión y reposabrazos con
 * joystick multiPILOT y mini-volante de dirección asistida, techo de protección (overhead guard) con rejilla
 * de alta visibilidad y baliza ámbar, y mástil triplex de alta elevación con carro retráctil móvil.
 */
export function createReachTruck(): AnimatedMachine {
  const g = group3();

  // 1. Chasis base y faldón inferior en gris antracita (JH_GREY)
  const chassis = part(boxGeo(1.08, 0.28, 0.95), JH_GREY, 0, 0.16, -0.875, true);
  g.add(chassis);

  // Paragolpes trasero envolvente de goma con pernos
  g.add(part(boxGeo(1.12, 0.18, 0.14), TYRE, 0, 0.16, -1.36));
  for (const x of [-0.44, -0.15, 0.15, 0.44]) {
    const bolt = part(cylGeo(0.018, 0.02, 6), METAL, x, 0.16, -1.44);
    bolt.rotation.x = Math.PI / 2;
    g.add(bolt);
  }

  // 2. Capó principal y carrocería envolvente en amarillo melón Jungheinrich (JH_YELLOW)
  g.add(part(boxGeo(1.06, 0.52, 0.82), JH_YELLOW, 0, 0.54, -0.85, true));
  g.add(part(boxGeo(1.02, 0.35, 0.18), JH_YELLOW, 0, 0.44, -1.28, true));

  // Tapa del compartimento de batería en gris antracita
  g.add(part(boxGeo(0.88, 0.08, 0.62), JH_GREY, 0, 0.82, -0.88));

  // Ranuras de ventilación traseras
  g.add(part(boxGeo(0.52, 0.14, 0.03), DARK, 0, 0.48, -1.38));
  for (const y of [0.44, 0.48, 0.52]) {
    g.add(part(boxGeo(0.48, 0.02, 0.04), JH_GREY, 0, y, -1.38));
  }

  // Logotipo Jungheinrich con franja negra, trazo amarillo y flecha roja
  g.add(part(boxGeo(0.55, 0.09, 0.03), DARK, 0, 0.68, -1.38));
  g.add(part(boxGeo(0.38, 0.04, 0.04), JH_YELLOW, -0.04, 0.68, -1.38));
  g.add(part(boxGeo(0.055, 0.055, 0.04), JH_RED, 0.2, 0.68, -1.38));

  // Placa distintiva turquesa con código de modelo "ETV 216"
  g.add(part(boxGeo(0.3, 0.07, 0.03), JH_TEAL, 0, 0.32, -1.38));
  g.add(part(boxGeo(0.24, 0.03, 0.04), REFLECT, 0, 0.32, -1.38));

  // 3. Patas de soporte de carga (outriggers) en amarillo Jungheinrich con raíles de rodadura de acero
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.18, 0.32, 1.95), JH_YELLOW, s * 0.55, 0.22, 0.47, true));
    g.add(part(boxGeo(0.19, 0.06, 1.9), JH_GREY, s * 0.55, 0.05, 0.47));
    g.add(part(boxGeo(0.07, 0.04, 1.8), METAL, s * 0.5, 0.39, 0.4));
  }
  g.add(part(boxGeo(1.02, 0.14, 0.14), JH_GREY, 0, 0.28, -0.45));

  // 4. Cabina interior y puesto de conducción transversal (lateral)
  g.add(part(boxGeo(0.66, 0.18, 0.58), JH_GREY, 0, 0.34, -0.85));
  g.add(part(boxGeo(0.64, 0.03, 0.56), DARK, 0, 0.435, -0.85));

  // Asiento ergonómico con suspensión y respaldo alto
  g.add(part(boxGeo(0.44, 0.32, 0.44), JH_GREY, 0.08, 0.58, -0.92));
  g.add(part(boxGeo(0.42, 0.1, 0.42), DARK, 0.08, 0.77, -0.92));
  g.add(part(boxGeo(0.08, 0.52, 0.42), DARK, 0.27, 1.05, -0.92));
  // Reposabrazos ergonómico con joystick multiPILOT
  g.add(part(boxGeo(0.12, 0.08, 0.32), DARK, -0.14, 0.95, -0.82));
  g.add(part(cylGeo(0.015, 0.06, 6), METAL, -0.14, 1.02, -0.72));
  g.add(part(sphereGeo(0.025, 4, 4), JH_RED, -0.14, 1.05, -0.72));

  // Consola con volante de dirección, pantalla digital y seta de emergencia
  g.add(part(boxGeo(0.24, 0.48, 0.26), JH_GREY, 0.12, 0.88, -0.55));
  g.add(part(boxGeo(0.26, 0.14, 0.28), DARK, 0.12, 1.15, -0.55));
  const tiller = part(cylGeo(0.07, 0.025, 8), DARK, 0.12, 1.25, -0.52);
  tiller.rotation.x = 0.4;
  g.add(tiller);
  g.add(part(boxGeo(0.12, 0.06, 0.02), GLASS, 0.12, 1.25, -0.62));
  g.add(part(cylGeo(0.025, 0.035, 6), JH_RED, 0.0, 1.24, -0.55));

  // Operario sentado lateralmente para visión panorámica del pasillo y las estanterías
  const operatorAnchor = group3();
  operatorAnchor.position.set(0.08, 0.82, -0.92);
  operatorAnchor.rotation.y = -Math.PI / 2;
  const operator = createWorker({ seated: true });
  operatorAnchor.add(operator.group);
  g.add(operatorAnchor);

  // 5. Techo de protección (overhead guard) de 4 pilares con rejilla de alta visibilidad
  for (const [x, z] of [[-0.52, -0.55], [0.52, -0.55], [-0.52, -1.22], [0.52, -1.22]] as const) {
    g.add(part(boxGeo(0.06, 1.28, 0.06), JH_GREY, x, 1.5, z));
  }
  g.add(part(boxGeo(1.12, 0.06, 0.74), JH_GREY, 0, 2.14, -0.89));
  for (const z of [-1.15, -1.02, -0.89, -0.76, -0.63]) {
    g.add(part(boxGeo(0.98, 0.03, 0.03), METAL, 0, 2.14, z));
  }
  g.add(part(cylGeo(0.05, 0.09, 6), YELLOW, 0, 2.22, -1.18));
  // Pilotos traseros, faros de trabajo y retrovisores fijados al techo de protección.
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.14, 0.07, 0.04), TAIL_LIGHT, s * 0.38, 0.62, -1.38));
    g.add(part(boxGeo(0.12, 0.05, 0.04), HEAD_LIGHT, s * 0.3, 0.28, -1.37));
    g.add(part(boxGeo(0.02, 0.2, 0.02), METAL, s * 0.66, 2.02, -0.62));
    g.add(part(boxGeo(0.1, 0.14, 0.05), DARK, s * 0.66, 2.14, -0.62));
  }

  // 6. Carro del mástil (reach carriage): avanza sobre los raíles de los outriggers
  const fz = 0.05;
  const reachBase = CARRY_CENTER.retractil - 0.65 - fz;
  const reach = group3();
  reach.position.set(0, 0, reachBase);
  g.add(reach);

  reach.add(part(boxGeo(1.0, 0.14, 0.32), 0x2a3550, 0, 0.36, -0.1));
  const mids: THREE.Mesh[] = [];
  const inners: THREE.Mesh[] = [];
  for (const x of [-0.44, 0.44]) {
    reach.add(part(boxGeo(0.1, 2.25, 0.1), METAL, x, 0.15 + 1.125, -0.14, true));
    const mid = part(boxGeo(0.085, 2.0, 0.085), 0x7a8598, x, 1.0, -0.07, true);
    const inner = part(boxGeo(0.07, 1.5, 0.07), 0x6b7689, x, 0.75, 0, true);
    reach.add(mid, inner);
    mids.push(mid);
    inners.push(inner);
  }
  reach.add(part(cylGeo(0.04, 2.2, 8), 0x383e48, 0, 1.25, -0.14));
  const topBar = part(boxGeo(0.98, 0.07, 0.07), METAL, 0, 1.6, 0);
  reach.add(topBar);

  const setLift = (lift: number) => {
    for (const m of mids) m.position.y = 0.2 + 0.35 * lift + 1.0;
    for (const i of inners) i.position.y = 0.25 + 0.7 * lift + 0.75;
    topBar.position.y = 0.25 + 0.7 * lift + 1.46;
  };
  setLift(0);

  const set = forkSet(FORK_LEN_1, 0.9, 0x2a3550);
  const forks = set.group;
  forks.position.set(0, FORK_REST, fz);
  forks.add(part(boxGeo(0.92, 0.7, 0.04), 0x2a3550, 0, 0.4, -0.06));
  reach.add(forks);

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0, 0.04, set.slots[0]);
  forks.add(palletGrip);

  // 7. Rodaje: rueda motriz trasera y ruedas de carga de poliuretano en las patas
  const wheels: THREE.Object3D[] = [];
  for (const [wx, wy, wz, r] of [
    [-0.55, 0.09, 1.35, 0.09],
    [0.55, 0.09, 1.35, 0.09],
    [0, 0.16, -0.85, 0.16],
    [-0.4, 0.07, -0.55, 0.07],
    [0.4, 0.07, -0.55, 0.07],
  ] as const) {
    const w = wheel(r, r > 0.1 ? 0.14 : 0.1, 8, wx, wy, wz, r > 0.1);
    g.add(w);
    wheels.push(w);
  }

  return { group: g, nodes: { forks, mast: reach, wheels, body: chassis, palletGrip, operator: operator.group, reach, reachBase, setLift, slots: set.slots, moving: [...mids, ...inners, topBar] } };
}
