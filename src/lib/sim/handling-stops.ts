/** Paradas de una maniobra en cada tipo de puesto (rack, suelo, flejadora y semirremolque), con la pose de los palés. (extraído de handling.ts) */

import { INTERIOR_DEPTH, dockPoint, faceNormal } from '@/lib/layout/dock-geometry';
import { LEVEL_HEIGHT } from '@/lib/layout/pinto-layout';
import type { Dock, Strapper } from '@/lib/layout/types';
import type { SimDeps } from '@/lib/sim/deps';
import { CARRY_CENTER, FLOOR_APPROACH, PALLET_LEN, STRAPPER_BELT_H, TRAILER_COLS, TRAILER_ROWS } from '@/lib/sim/handling-constants';
import type { PalletPose, Stop } from '@/lib/sim/handling-types';
import type { MachineKind, Point, SimState, Truck } from '@/lib/sim/types';

/** Pose de un palé en el semirremolque: 3 de frente y 11 filas, de la cabeza a las puertas, columna a columna. */
export function trailerPalletPose(t: Pick<Truck, 'pos' | 'heading'>, i: number): PalletPose {
  const col = Math.min(TRAILER_COLS - 1, Math.floor(i / TRAILER_ROWS));
  const row = i % TRAILER_ROWS;
  const lx = (col - 1) * 0.82;
  const lz = -1.3 + row * 1.2;
  const cos = Math.cos(t.heading);
  const sin = Math.sin(t.heading);
  return { x: t.pos.x + lx * cos + lz * sin, y: 0, z: t.pos.z - lx * sin + lz * cos, rotY: t.heading - Math.PI / 2 };
}

/** ¿Caben los palés `i` e `i+1` seguidos en la misma columna del semirremolque (para llevarlos en tándem)? */
export function tandemAt(i: number): boolean {
  return Math.floor(i / TRAILER_ROWS) === Math.floor((i + 1) / TRAILER_ROWS) && i + 1 < TRAILER_ROWS * TRAILER_COLS;
}

function headingOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Parada frente a un hueco de rack (la máquina se encara al rack desde su puesto de trabajo). */
export function rackStop(state: SimState, deps: SimDeps, locId: string | null | undefined, kind: Stop['kind'], paletId: string): Stop | null {
  if (!locId) return null;
  const at = deps.slotStops.get(locId);
  const slot = state.slotPos[locId];
  if (!at || !slot) return null;
  const dx = slot.x - at.x;
  const dir = Math.sign(dx) || 1;
  return {
    x: at.x,
    z: at.z,
    kind,
    paletIds: [paletId],
    where: 'rack',
    height: slot.level * LEVEL_HEIGHT,
    face: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
    depth: Math.abs(dx),
    place: { x: slot.x, y: slot.y, z: slot.z, rotY: 0 },
  };
}

/** Parada en el suelo: el primer palé queda en `ref` y la máquina llega por detrás, mirando en la dirección `dir`. */
export function floorStop(machine: MachineKind, kind: Stop['kind'], paletIds: string[], ref: Point, dir: Point): Stop {
  const len = Math.hypot(dir.x, dir.z) || 1;
  const d = { x: dir.x / len, z: dir.z / len };
  const depth = CARRY_CENTER[machine] + FLOOR_APPROACH;
  const face = headingOf(d.x, d.z);
  return {
    x: ref.x - d.x * depth,
    z: ref.z - d.z * depth,
    kind,
    paletIds,
    where: 'floor',
    height: 0,
    face,
    depth,
    place: { x: ref.x, y: 0, z: ref.z, rotY: face - Math.PI / 2 },
  };
}

/** Parada en la flejadora: entrada (recogepedidos deposita en cinta a 0,62m) o salida (transpaleta retira de la cinta a 0,62m). */
export function strapperStop(
  machine: MachineKind,
  kind: Stop['kind'],
  paletIds: string[],
  station: Strapper,
  isInput: boolean,
): Stop {
  const cz = (station.rect.zMin + station.rect.zMax) / 2;
  const depth = CARRY_CENTER[machine] + FLOOR_APPROACH;
  if (isInput) {
    // Entrada: el vehículo encara el inicio del camino de rodillos hacia el este (+X)
    const placeX = station.rect.xMin + 0.65;
    const face = Math.PI / 2;
    return {
      x: placeX - depth,
      z: cz,
      kind,
      paletIds,
      where: 'strapper',
      height: STRAPPER_BELT_H,
      face,
      depth,
      place: { x: placeX, y: STRAPPER_BELT_H, z: cz, rotY: 0 },
    };
  } else {
    // Salida: el vehículo encara el final de la vía de rodillos hacia el oeste (-X)
    const placeX = station.rect.xMax - 0.65;
    const face = -Math.PI / 2;
    return {
      x: placeX + depth,
      z: cz,
      kind,
      paletIds,
      where: 'strapper',
      height: STRAPPER_BELT_H,
      face,
      depth,
      place: { x: placeX, y: STRAPPER_BELT_H, z: cz, rotY: 0 },
    };
  }
}

/** Parada en el semirremolque atracado: la máquina entra recta por la puerta del muelle hasta los palés `ids`. */
export function trailerStop(truck: Truck, dock: Dock, kind: Stop['kind'], ids: string[], index: number): Stop {
  const n = faceNormal(dock.face);
  const pose = trailerPalletPose(truck, index);
  const centre = dock.face === 'south' ? dock.x : dock.z;
  const lateral = (dock.face === 'south' ? pose.x : pose.z) - centre;
  const door = dockPoint(dock, lateral, INTERIOR_DEPTH);
  const depth = (pose.x - door.x) * n.x + (pose.z - door.z) * n.z;
  return { x: door.x, z: door.z, kind, paletIds: ids, where: 'trailer', height: 0, face: headingOf(n.x, n.z), depth, place: pose };
}

/** Punto de ruta de una parada. */
export function stopPoint(s: Stop): Point {
  return { x: s.x, z: s.z };
}

/** Pose del palé `k` (0 = el más cercano a la máquina) de una parada: el segundo va 1,2 m más allá en la dirección de `face`. */
export function stopPalletPose(stop: Stop, k: number): PalletPose {
  const off = k * PALLET_LEN;
  return { ...stop.place, x: stop.place.x + Math.sin(stop.face) * off, z: stop.place.z + Math.cos(stop.face) * off };
}
