import * as THREE from 'three';
import { group3 } from '@/three/builders/utils';
import { createBrandDecal } from '@/three/branding';
import { TRAILER_BED_H, BLUE, ORANGE, DARK, LIGHT, METAL, GLASS, HEAD_LIGHT, TAIL_LIGHT, RIB, boxGeo, cylGeo, part, wheel } from './shared';

/**
 * Tractora de cabina avanzada + semirremolque de 13,6 m. El morro del remolque queda a 0,35 m de la trasera de la
 * cabina y la quinta rueda lo une al chasis, así que no hay hueco entre tractora y caja. El origen sigue en la
 * trasera del remolque (z = 11,6); la tractora ocupa z −4,8…−2,35 y el semirremolque z −2…11,6.
 */
export function createTruck({ reefer }: { reefer?: boolean } = {}) {
  const g = group3();
  const trailerBody = group3();
  g.add(trailerBody);
  const bedY = TRAILER_BED_H + 1.35;
  const CAB = 0x0f7bb0;
  const CAB_DARK = 0x0b5f8a;
  const FRAME = 0x2a3550;

  // Cabina avanzada: frontal plano con parabrisas, rejilla, faros y paragolpes; techo con deflector aerodinámico.
  g.add(part(boxGeo(2.45, 2.2, 2.1), CAB, 0, 2.05, -3.4, true));
  g.add(part(boxGeo(2.45, 0.12, 2.1), CAB_DARK, 0, 3.2, -3.4));
  g.add(part(boxGeo(2.25, 1.0, 0.06), GLASS, 0, 2.55, -4.46));
  g.add(part(boxGeo(2.3, 0.08, 0.35), CAB_DARK, 0, 3.08, -4.58));
  g.add(part(boxGeo(1.9, 0.6, 0.06), DARK, 0, 1.5, -4.46));
  g.add(part(boxGeo(2.45, 0.3, 0.35), DARK, 0, 0.72, -4.62));
  const deflector = part(boxGeo(2.3, 0.92, 0.1), CAB_DARK, 0, 3.55, -3.6);
  deflector.rotation.x = 0.71;
  g.add(deflector);
  for (const s of [-1, 1]) {
    g.add(part(boxGeo(0.45, 0.2, 0.08), HEAD_LIGHT, s * 0.95, 1.25, -4.48));
    g.add(part(boxGeo(0.04, 0.9, 1.2), GLASS, s * 1.24, 2.5, -3.6));
    g.add(part(boxGeo(0.05, 0.7, 1.2), CAB_DARK, s * 1.15, 3.55, -3.2));
    g.add(part(boxGeo(0.25, 0.5, 0.08), DARK, s * 1.45, 2.55, -4.2));
    g.add(part(boxGeo(0.3, 0.06, 0.8), DARK, s * 1.35, 0.8, -3.4));
  }

  // Parrilla cromada, barra de faros de techo y deflector bajo la cabina.
  g.add(part(boxGeo(1.9, 0.05, 0.08), METAL, 0, 1.85, -4.52));
  g.add(part(boxGeo(1.7, 0.06, 0.06), HEAD_LIGHT, 0, 3.26, -4.3));
  g.add(part(boxGeo(2.2, 0.16, 0.14), DARK, 0, 0.42, -4.66));

  // Chasis de la tractora, quinta rueda, depósito y escape.
  g.add(part(boxGeo(1.9, 0.4, 5.0), FRAME, 0, 0.75, -1.9, true));
  g.add(part(boxGeo(1.6, 0.05, 1.2), FRAME, 0, 1.0, -0.3));
  g.add(part(boxGeo(0.4, 0.1, 0.4), FRAME, 0, 1.08, -0.3));
  const tank = part(cylGeo(0.3, 1.3, 8), METAL, 1.15, 0.6, -2.0);
  tank.rotation.x = Math.PI / 2;
  g.add(tank);
  g.add(part(cylGeo(0.07, 2.4, 6), METAL, 1.2, 2.4, -2.2));

  // Semirremolque 13,6 m: caja hueca con plataforma, paredes y techo para albergar palés de carga/descarga.
  const trailerColor = reefer ? 0xe8eef4 : LIGHT;
  const trailer = group3();
  trailer.name = 'trailer-box';
  trailerBody.add(trailer);
  // Plataforma interior del semirremolque a cota de andén (1,2 m)
  trailer.add(part(boxGeo(2.45, 0.12, 13.6), FRAME, 0, bedY - 1.29, 4.8, true));
  // Techo del semirremolque
  trailer.add(part(boxGeo(2.55, 0.08, 13.6), trailerColor, 0, bedY + 1.31, 4.8, true));
  // Pared frontal (morro del remolque)
  trailer.add(part(boxGeo(2.45, 2.54, 0.08), trailerColor, 0, bedY, -1.96, true));
  // Paredes laterales
  for (const s of [-1, 1]) {
    trailer.add(part(boxGeo(0.06, 2.54, 13.6), trailerColor, s * 1.25, bedY, 4.8, true));
  }

  trailerBody.add(part(boxGeo(2.2, 0.2, 10.8), FRAME, 0, 1.1, 6.2, true));
  trailerBody.add(part(boxGeo(2.0, 0.4, 10.8), FRAME, 0, 0.8, 6.2));
  for (let i = 0; i < 6; i++) {
    const z = -1.0 + i * 2.2;
    for (const s of [-1, 1]) trailerBody.add(part(boxGeo(0.05, 2.5, 0.12), RIB, s * 1.3, bedY, z));
  }

  // Puertas traseras: dos hojas con bisagra en las esquinas. Abiertas se pegan a los laterales (≈ 264°).
  const doors = group3();
  doors.name = 'trailer-doors';
  trailerBody.add(doors);
  const doorZ = 4.8 + 6.8 + 0.03;
  const doorLeaves: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = group3();
    pivot.position.set(s * 1.31, bedY, doorZ);
    pivot.userData.side = s;
    const leaf = group3();
    leaf.position.x = -s * 0.64;
    leaf.add(part(boxGeo(1.28, 2.5, 0.06), RIB, 0, 0, 0));
    leaf.add(part(boxGeo(0.05, 0.4, 0.05), METAL, -s * 0.5, 0, 0.05));
    leaf.add(part(boxGeo(0.15, 0.3, 0.05), TAIL_LIGHT, s * 0.5, 1.2, 0.05));
    pivot.add(leaf);
    doors.add(pivot);
    doorLeaves.push(pivot);
  }

  for (const s of [-1, 1]) {
    trailerBody.add(part(boxGeo(0.02, 0.22, 13.2), BLUE, s * 1.28, 1.5, 4.8));
    trailerBody.add(part(boxGeo(0.02, 0.06, 13.2), ORANGE, s * 1.28, 1.7, 4.8));
    // Placa de marca en los laterales (logo ALDI Nord).
    const decal = createBrandDecal(2.2, 2.3);
    decal.position.set(s * 1.3, bedY, 8.6);
    decal.rotation.y = s * (Math.PI / 2);
    trailerBody.add(decal);
    // Pata de apoyo bajo el morro del remolque, fuera del chasis de la tractora.
    g.add(part(cylGeo(0.05, 0.9, 6), METAL, s * 1.1, 0.45, -1.2));
  }

  // Faldones antiproyección tras el último eje y guardabarros de la caja.
  for (const s of [-1, 1]) {
    trailerBody.add(part(boxGeo(0.06, 0.6, 0.5), DARK, s * 1.05, 0.55, 11.2));
    trailerBody.add(part(boxGeo(2.3, 0.1, 0.25), DARK, 0, 1.0, 11.35));
  }

  // Grupo frigorífico sobre el morro del remolque, por encima del techo de la cabina.
  if (reefer) {
    g.add(part(boxGeo(2.0, 0.8, 0.5), 0xb9c4d2, 0, 3.45, -2.25, true));
    g.add(part(boxGeo(0.7, 0.5, 0.1), 0x4d5b6b, 0, 3.45, -2.53));
    const fan = part(cylGeo(0.22, 0.05, 8), DARK, 0, 3.45, -2.6);
    fan.rotation.x = Math.PI / 2;
    g.add(fan);
  }

  // Ruedas de la tractora (eje delantero y de tracción) y del semirremolque (tres ejes traseros), con tapacubos.
  const wheels: THREE.Object3D[] = [];
  for (const [wx, wz] of [[-1.05, -3.9], [1.05, -3.9], [-1.05, -0.9], [1.05, -0.9]] as const) {
    const w = wheel(0.4, 0.35, 10, wx, 0.4, wz, true);
    g.add(w);
    wheels.push(w);
  }
  for (let i = 0; i < 3; i++) {
    for (const s of [-1.05, 1.05]) {
      const w = wheel(0.3, 0.3, 10, s, 0.3, 8.4 + i * 1.2, true);
      g.add(w);
      wheels.push(w);
    }
  }

  return { group: g, nodes: { trailer, trailerBody, wheels, doors, doorLeaves } };
}
