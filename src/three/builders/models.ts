import * as THREE from 'three';
import { box, lambert, group3 } from '@/three/builders/utils';
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

/** Altura del piso del semirremolque cuando está atracado (altura de andén, 1,2 m). */
export const TRAILER_DOCK_LIFT = 0.65;

const BLUE = 0x1f3d7a;
const ORANGE = 0xf39200;
const YELLOW = 0xe9c93a;
const DARK = 0x27303f;
const LIGHT = 0xdfe6ee;

const chassisMat = () => lambert(BLUE);
const metalMat = () => lambert(0x8a95a8);

/** Carretilla retráctil: chasis, mástil triplex alto, horquillas y tejadillo. */
export function createReachTruck(): AnimatedMachine {
  const g = group3();

  const chassis = box(0.9, 0.5, 1.4, chassisMat());
  chassis.position.y = 0.35;
  g.add(chassis);

  const counterweight = box(0.9, 0.9, 0.35, lambert(0x2a3550));
  counterweight.position.set(0, 0.5, -0.72);
  g.add(counterweight);

  const mast = new THREE.Group();
  mast.position.set(0, 0.5, 0.55);
  g.add(mast);

  const mastPost = box(0.22, 2.6, 0.22, metalMat(), 0, 1.3, 0);
  mast.add(mastPost);
  const mastPost2 = box(0.22, 2.6, 0.22, metalMat(), 0.45, 1.3, 0);
  mast.add(mastPost2);

  const forks = new THREE.Group();
  forks.position.set(0.34, 0.2, 0.05);
  mast.add(forks);
  const forkL = box(0.08, 0.06, 1.3, metalMat());
  forkL.position.set(0.08, 0.03, 0.5);
  forks.add(forkL);
  const forkR = box(0.08, 0.06, 1.3, metalMat());
  forkR.position.set(0.5, 0.03, 0.5);
  forks.add(forkR);

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0.34, 0.18, 1.0);
  forks.add(palletGrip);

  // Tejadillo con techo
  const roof = box(1.0, 0.06, 1.4, lambert(ORANGE));
  roof.position.set(0, 1.4, 0);
  g.add(roof);
  const roofPost = box(0.05, 0.9, 0.05, metalMat(), -0.3, 0.95, -0.6);
  g.add(roofPost);
  const roofPost2 = box(0.05, 0.9, 0.05, metalMat(), 0.3, 0.95, -0.6);
  g.add(roofPost2);

  // Ruedas
  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12), lambert(DARK));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.14, wz);
    g.add(wheel);
    wheels.push(wheel);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip } };
}

/**
 * Apilador eléctrico Jungheinrich ERE 225i: transpaleta con plataforma baja, mástil corto y operario a pie
 * que lleva el timón. Proporciones de transpaleta eléctrica (no de contrapesada).
 */
export function createErE225i(): AnimatedMachine {
  const g = group3();
  const BODY = 0x2b4f8a;

  // Chasis bajo y cubierta de batería.
  const chassis = box(0.8, 0.3, 1.5, lambert(BODY));
  chassis.position.y = 0.2;
  g.add(chassis);
  g.add(box(0.74, 0.2, 0.9, lambert(0x3a4a5c), 0, 0.4, -0.25));

  // Mástil corto (a 1,3 m) con dos montantes y travesaño.
  const mast = new THREE.Group();
  mast.position.set(0, 0.3, 0.6);
  g.add(mast);
  mast.add(box(0.08, 1.3, 0.08, metalMat(), -0.3, 0.65, 0));
  mast.add(box(0.08, 1.3, 0.08, metalMat(), 0.3, 0.65, 0));
  mast.add(box(0.7, 0.08, 0.08, metalMat(), 0, 1.25, 0));

  // Horquillas bajas: se sitúan a 0,06 m y suben con liftHeight.
  const forks = new THREE.Group();
  forks.position.set(0, 0.06, 0.6);
  g.add(forks);
  forks.add(box(0.07, 0.05, 1.15, metalMat(), -0.25, 0.0, 0.55));
  forks.add(box(0.07, 0.05, 1.15, metalMat(), 0.25, 0.0, 0.55));
  forks.add(box(0.6, 0.05, 0.1, metalMat(), 0, 0.0, 0.05));

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0, 0.04, 1.0);
  forks.add(palletGrip);

  // Timón con empuñadura.
  const tiller = box(0.05, 0.05, 0.55, metalMat(), 0.2, 0.75, -0.45);
  tiller.rotation.x = -0.4;
  g.add(tiller);

  // Operario a pie, detrás del timón (lateral izquierdo).
  const operator = createWorker();
  operator.group.position.set(-0.3, 0.2, -0.45);
  operator.group.scale.setScalar(0.8);
  g.add(operator.group);

  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.35, 0.5], [0.35, 0.5]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), lambert(DARK));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.09, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  // Rueda de tracción trasera (centrada).
  const drive = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), lambert(DARK));
  drive.rotation.z = Math.PI / 2;
  drive.position.set(0, 0.12, -0.55);
  g.add(drive);
  wheels.push(drive);

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip, operator: operator.group } };
}

/** Recogepedidos: horquillas largas para 2 palets y torre con el operario de pie. */
export function createOrderPicker(): AnimatedMachine {
  const g = group3();

  const chassis = box(0.95, 0.5, 1.6, lambert(BLUE));
  chassis.position.y = 0.35;
  g.add(chassis);

  // Plataforma a nivel de suelo: el recogepedidos no eleva al operario (el picking es solo de suelo).

  const platform = box(1.0, 0.06, 0.7, lambert(ORANGE), 0, 0.55, 0.2);
  g.add(platform);

  // Operario de pie sobre la plataforma
  const operator = createWorker();
  operator.group.position.set(0, 0.55, 0.75);
  g.add(operator.group);

  const forks = new THREE.Group();
  forks.position.set(0.33, 0.2, 0.4);
  g.add(forks);
  const forkL = box(0.09, 0.06, 2.0, metalMat(), 0.1, 0.03, 0.9);
  forks.add(forkL);
  const forkR = box(0.09, 0.06, 2.0, metalMat(), 0.55, 0.03, 0.9);
  forks.add(forkR);

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0.33, 0.18, 1.6);
  forks.add(palletGrip);

  const mast = new THREE.Group();
  g.add(mast);

  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.45, 0.6], [0.45, 0.6], [-0.45, -0.6], [0.45, -0.6]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.11, 12), lambert(DARK));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.13, wz);
    g.add(wheel);
    wheels.push(wheel);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip, operator: operator.group } };
}

/**
 * Tractora + semirremolque de 13,6 m. El semirremolque (caja y decoración) va en `trailerBody`,
 * que sube `TRAILER_DOCK_LIFT` al atracar para que su piso quede a altura de andén.
 */
export function createTruck({ reefer }: { reefer?: boolean } = {}) {
  const g = group3();
  const trailerBody = group3();
  g.add(trailerBody);

  // Tractora
  const cab = box(2.2, 2.4, 1.8, lambert(0x0f7bb0), 0, 1.2, -6.2);
  g.add(cab);
  const cabRoof = box(2.2, 0.35, 1.8, lambert(0x0b5f8a), 0, 2.7, -6.2);
  g.add(cabRoof);
  const grill = box(2.2, 0.8, 0.2, lambert(0x2a3550), 0, 1.05, -7.2);
  g.add(grill);
  const deflector = box(2.2, 0.9, 0.4, lambert(0x8a95a8), 0, 2.9, -6.6);
  g.add(deflector);

  // Chasis de la tractora.
  const chassis = box(2.3, 0.5, 4.5, lambert(0x2a3550), 0, 0.7, -3.4);
  g.add(chassis);

  // Semirremolque 13,6 m (caja de fondo en su propio grupo, elevable).
  const trailer = box(2.55, 2.7, 13.6, lambert(reefer ? 0xe8eef4 : 0xdfe6ee));
  trailer.position.set(0, 1.9, 4.8);
  trailerBody.add(trailer);
  // Larguero del semirremolque bajo la caja (une la caja con los ejes).
  trailerBody.add(box(2.2, 0.25, 13.0, lambert(0x2a3550), 0, 0.45, 4.8));

  // Placa de marca en los laterales (logo ALDI Nord).
  const decalPw = 2.2;
  const decalPh = 2.3;
  const decalZ = 8.6;
  const sideRight = createBrandDecal(decalPw, decalPh);
  sideRight.position.set(1.3, 2.0, decalZ);
  sideRight.rotation.y = Math.PI / 2;
  trailerBody.add(sideRight);
  const sideLeft = createBrandDecal(decalPw, decalPh);
  sideLeft.position.set(-1.3, 2.0, decalZ);
  sideLeft.rotation.y = -Math.PI / 2;
  trailerBody.add(sideLeft);
  if (reefer) {
    const unit = box(2.2, 2.4, 0.9, lambert(0xb9c4d2), 0, 1.9, -2.7);
    g.add(unit);
    const unitGrill = box(0.7, 0.9, 0.35, lambert(0x4d5b6b), 0, 1.9, -3.15);
    g.add(unitGrill);
  }
  const kingpin = box(0.4, 0.4, 0.4, lambert(0x2a3550), 0, 0.95, -0.8);
  g.add(kingpin);

  // Ruedas de la tractora y del semirremolque (las ruedas no suben: solo la caja).
  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz, r] of [[-1.05, -7.0, 0.4], [1.05, -7.0, 0.4], [-1.05, -4.0, 0.4], [1.05, -4.0, 0.4]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.35, 14), lambert(DARK));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, r, wz);
    g.add(wheel);
    wheels.push(wheel);
  }
  for (let i = 0; i < 3; i++) {
    for (const s of [-1.05, 1.05]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 14), lambert(DARK));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s, 0.3, 2.5 + i * 2.2);
      g.add(wheel);
      wheels.push(wheel);
    }
  }

  return { group: g, nodes: { trailer, trailerBody, wheels } };
}

/** Persona tipo cápsula con chaleco reflectante. */
export function createWorker() {
  const g = group3();

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 12), lambert(0x39517a));
  torso.position.y = 0.95;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lambert(LIGHT));
  head.position.y = 1.5;
  g.add(head);

  const vest = box(0.44, 0.3, 0.2, lambert(ORANGE), 0, 1.05, 0.02);
  g.add(vest);
  const vestL = box(0.12, 0.22, 0.05, lambert(0xffffff), -0.18, 1.02, 0.12);
  g.add(vestL);
  const vestR = box(0.12, 0.22, 0.05, lambert(0xffffff), 0.18, 1.02, 0.12);
  g.add(vestR);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), lambert(YELLOW));
  helmet.position.y = 1.56;
  g.add(helmet);

  return { group: g, nodes: {} as Record<string, THREE.Object3D> };
}

/** Palet simulado (caja 1,2 × h × 0,8) suelto, útil para montar carga en modelos. */
export function createPallet(height = 1.2, color = 0xa9875b) {
  const pallet = box(1.2, height, 0.8, lambert(color));
  pallet.position.y = height / 2;
  return pallet;
}

/** Transpaleta eléctrica con plataforma/asiento lateral (ESE): lleva pedidos preparados a los muelles. */
export function createPalletTruck(): AnimatedMachine {
  const g = group3();

  const chassis = box(0.8, 0.4, 1.5, lambert(BLUE));
  chassis.position.y = 0.3;
  g.add(chassis);

  // Asiento lateral y timón
  const seat = box(0.45, 0.12, 0.45, lambert(DARK), -0.45, 0.62, -0.1);
  g.add(seat);
  const tiller = box(0.06, 0.06, 0.7, metalMat(), 0.05, 0.9, -0.55);
  tiller.rotation.x = -0.35;
  g.add(tiller);

  const mast = new THREE.Group();
  g.add(mast);
  const mastPost = box(0.12, 1.0, 0.12, metalMat(), 0.25, 0.85, 0.55);
  mast.add(mastPost);

  const forks = new THREE.Group();
  forks.position.set(0.25, 0.15, 0.2);
  g.add(forks);
  forks.add(box(0.07, 0.05, 1.3, metalMat(), -0.22, 0.03, 0.65));
  forks.add(box(0.07, 0.05, 1.3, metalMat(), 0.22, 0.03, 0.65));

  const palletGrip = new THREE.Group();
  palletGrip.position.set(0.25, 0.14, 1.2);
  forks.add(palletGrip);

  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-0.38, 0.5], [0.38, 0.5], [0, -0.6]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 12), lambert(DARK));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.11, wz);
    g.add(wheel);
    wheels.push(wheel);
  }

  return { group: g, nodes: { forks, mast, wheels, body: chassis, palletGrip } };
}
