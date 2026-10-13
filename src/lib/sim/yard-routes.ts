/**
 * Carriles del patio para los camiones (polilíneas en metros, sin three). Cada ruta empieza en el punto
 * donde arranca el tramo (el camión la recibe con su posición delante: ver `followPath`).
 *
 * Circulación (x = este, z = sur):
 * - Entrada: vial perimetral norte (z = 178) hacia el oeste, vial este (x = 203) hacia el norte y báscula
 *   (z = 150) hacia el oeste. Espera antes de la báscula en SCALE_HOLD.
 * - Distribuidor: x = 150 hacia el norte (es el carril de aproximación de la batería este).
 * - Sur: carril de aproximación z = 105 hacia el oeste y carril de salida z = 117,5 hacia el este.
 * - Este: aproximación x = 150 hacia el norte y salida x = 162,5 hacia el sur.
 * - Salida: z = 117,5 hasta x = 207, al sur por x = 207 y al este por z = 182.
 * - Bucle de reentrada (camiones que salen de una plaza de espera): z = 117,5 → x = 190 → z = 145 → x = 150.
 * Las esquinas se redondean con un radio mayor que el de giro mínimo; los arcos de atraque son exactos.
 */
import type { Dock, YardStall } from '@/lib/layout/types';
import { DOCK_TURN_RADIUS, FACE_V, YARD_APPROACH_V, YARD_EXIT_V, dockApproach, dockU } from '@/lib/layout/dock-geometry';
import type { Point } from '@/lib/sim/types';

/** Radio de las esquinas de los carriles (algo mayor que el de giro mínimo, para que el seguimiento sea holgado). */
const CORNER_R = 13;
/** Separación entre puntos de un arco (m). */
const ARC_STEP = 1.5;

export const TRUCK_SPAWN: Point = { x: 260, z: 178 };
export const TRUCK_DESPAWN: Point = { x: 260, z: 182 };
/** Rumbo de entrada (hacia el oeste). */
export const SPAWN_HEADING = Math.PI / 2;
const IN_CORNER: Point = { x: 203, z: 178 };
const IN_TURN: Point = { x: 203, z: 150 };
/** Espera antes de la báscula: un camión detrás del que está pesando. */
export const SCALE_HOLD: Point = { x: 182, z: 150 };
/** Origen del camión centrado sobre la báscula (160, 150): el centro del camión está 2,15 m detrás del origen. */
export const SCALE_STOP: Point = { x: 157.8, z: 150 };
/** Distribuidor norte-sur (carril de aproximación de la batería este). */
const IN_LANE_X = FACE_V.east + YARD_APPROACH_V;
const SOUTH_APPROACH_Z = FACE_V.south + YARD_APPROACH_V;
const SOUTH_EXIT_Z = FACE_V.south + YARD_EXIT_V;
const EAST_EXIT_X = FACE_V.east + YARD_EXIT_V;
const OUT_X = 207;
const OUT_Z = 182;
const LOOP_X = 190;
const LOOP_Z = 145;
/** Origen del camión aparcado de frente en una plaza (fila z = 130, plazas de 17 m): trasera a z ≈ 127,9. */
const STALL_PARK_DEPTH = 9.5;
/** Retroceso recto al salir de la plaza antes de girar. */
const STALL_BACK_Z = 130;

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, z: a.z - b.z };
}
function norm(a: Point): Point {
  const l = Math.hypot(a.x, a.z) || 1;
  return { x: a.x / l, z: a.z / l };
}

/**
 * Arco de un cuarto de vuelta (o `angle`) desde `p`, moviéndose en la dirección unitaria `dir`,
 * girando a la izquierda o a la derecha del sentido de marcha. Devuelve los puntos tras `p`.
 */
export function arcPoints(p: Point, dir: Point, side: 'left' | 'right', r = DOCK_TURN_RADIUS, angle = Math.PI / 2): Point[] {
  // Izquierda de (dx, dz) con x al este y z al sur: (dz, −dx).
  const s = side === 'left' ? { x: dir.z, z: -dir.x } : { x: -dir.z, z: dir.x };
  const c = { x: p.x + s.x * r, z: p.z + s.z * r };
  const r0 = sub(p, c);
  const n = Math.max(2, Math.ceil((r * angle) / ARC_STEP));
  const pts: Point[] = [];
  for (let k = 1; k <= n; k++) {
    const th = (angle * k) / n;
    pts.push({ x: c.x + r0.x * Math.cos(th) + dir.x * r * Math.sin(th), z: c.z + r0.z * Math.cos(th) + dir.z * r * Math.sin(th) });
  }
  return pts;
}

/** Redondea las esquinas (giro > 0,2 rad) de una polilínea con arcos de radio `r` (o el mayor que quepa). */
export function fillet(poly: Point[], r = CORNER_R): Point[] {
  if (poly.length < 3) return [...poly];
  const isCorner = (i: number) => {
    if (i <= 0 || i >= poly.length - 1) return false;
    const a = norm(sub(poly[i], poly[i - 1]));
    const b = norm(sub(poly[i + 1], poly[i]));
    return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) > 0.2;
  };
  const out: Point[] = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) {
    if (!isCorner(i)) {
      out.push(poly[i]);
      continue;
    }
    const inV = sub(poly[i], poly[i - 1]);
    const outV = sub(poly[i + 1], poly[i]);
    const inLen = Math.hypot(inV.x, inV.z);
    const outLen = Math.hypot(outV.x, outV.z);
    const a = norm(inV);
    const b = norm(outV);
    const theta = Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
    const avail = Math.min(inLen * (isCorner(i - 1) ? 0.5 : 1), outLen * (isCorner(i + 1) ? 0.5 : 1)) - 0.01;
    const t = Math.min(r * Math.tan(theta / 2), avail);
    const rr = t / Math.tan(theta / 2);
    const start = { x: poly[i].x - a.x * t, z: poly[i].z - a.z * t };
    out.push(start);
    const cross = a.x * b.z - a.z * b.x;
    // Con z al sur, un producto vectorial positivo es un giro a la derecha (sentido horario visto desde arriba).
    out.push(...arcPoints(start, a, cross > 0 ? 'right' : 'left', rr, theta));
  }
  out.push(poly[poly.length - 1]);
  return out;
}

/** Arco de atraque: del inicio de la maniobra (carril de aproximación) al punto de parada antes de la marcha atrás. */
function dockArc(dock: Dock): Point[] {
  const a = dockApproach(dock);
  return dock.face === 'south' ? arcPoints(a.start, { x: -1, z: 0 }, 'left') : arcPoints(a.start, { x: 0, z: -1 }, 'right');
}

/** De la entrada de la parcela a la espera de la báscula. */
export function gateRoute(): Point[] {
  return fillet([TRUCK_SPAWN, IN_CORNER, IN_TURN, SCALE_HOLD]).slice(1);
}

/** Origen del distribuidor: desde la báscula o desde el bucle de reentrada. */
function feeder(from: 'scale' | Point): Point[] {
  // La báscula está a solo 8 m del distribuidor: el camión gira a la derecha nada más bajar (radio 13)
  // y se incorpora a x = 150 con una diagonal suave.
  if (from === 'scale') return [SCALE_STOP, ...arcPoints(SCALE_STOP, { x: -1, z: 0 }, 'right', CORNER_R), { x: IN_LANE_X, z: 120 }];
  return [from, { x: LOOP_X, z: SOUTH_EXIT_Z }, { x: LOOP_X, z: LOOP_Z }, { x: IN_LANE_X, z: LOOP_Z }];
}

/** Ruta hasta el punto de parada de la maniobra de un muelle (sin incluir la marcha atrás). */
export function approachRoute(from: 'scale' | Point, dock: Dock): Point[] {
  const a = dockApproach(dock);
  const lanes = dock.face === 'south' ? [...feeder(from), { x: IN_LANE_X, z: SOUTH_APPROACH_Z }, a.start] : [...feeder(from), a.start];
  return [...fillet(lanes).slice(1), ...dockArc(dock)];
}

/** Centro de una plaza de semirremolques (la plaza va de stall.x a stall.x + width). */
function stallX(stall: YardStall): number {
  return stall.x + stall.width / 2;
}

/** Punto de aparcamiento (origen del camión) en una plaza, de frente y mirando al sur. */
export function stallPoint(stall: YardStall): Point {
  return { x: stallX(stall), z: stall.z + STALL_PARK_DEPTH };
}

/** Ruta de la báscula a una plaza de espera: carril de aproximación, giro a la izquierda y entrada de frente. */
export function stallRoute(stall: YardStall): Point[] {
  const sx = stallX(stall);
  const start = { x: sx + DOCK_TURN_RADIUS, z: SOUTH_APPROACH_Z };
  const lanes = [...feeder('scale'), { x: IN_LANE_X, z: SOUTH_APPROACH_Z }, start];
  return [...fillet(lanes).slice(1), ...arcPoints(start, { x: -1, z: 0 }, 'left'), stallPoint(stall)];
}

/** Salida de la plaza en marcha atrás: recta y giro hasta quedar en el carril de salida mirando al este. */
export function unparkRoute(stall: YardStall): Point[] {
  const back = { x: stallX(stall), z: STALL_BACK_Z };
  return [back, ...arcPoints(back, { x: 0, z: -1 }, 'left')];
}

/** Final del retroceso de una plaza (en el carril de salida, mirando al este). */
export function unparkEnd(stall: YardStall): Point {
  return { x: stallX(stall) - DOCK_TURN_RADIUS, z: SOUTH_EXIT_Z };
}

/** Salida de un muelle: avance recto, giro hacia el carril de salida y fuera de la parcela. */
export function pulloutRoute(dock: Dock): Point[] {
  const u = dockU(dock);
  if (dock.face === 'south') {
    const p = { x: u, z: SOUTH_APPROACH_Z };
    const arc = arcPoints(p, { x: 0, z: 1 }, 'left');
    const end = arc[arc.length - 1];
    return [p, ...arc, ...fillet([end, { x: OUT_X, z: SOUTH_EXIT_Z }, { x: OUT_X, z: OUT_Z }, TRUCK_DESPAWN]).slice(1)];
  }
  const p = { x: IN_LANE_X, z: u };
  const arc = arcPoints(p, { x: 1, z: 0 }, 'right');
  const end = arc[arc.length - 1];
  return [
    p,
    ...arc,
    ...fillet([end, { x: EAST_EXIT_X, z: SOUTH_EXIT_Z }, { x: OUT_X, z: SOUTH_EXIT_Z }, { x: OUT_X, z: OUT_Z }, TRUCK_DESPAWN]).slice(1),
  ];
}

/** Polilíneas de todos los carriles (para dibujarlos o comprobarlos). */
export function yardLanes(docks: Dock[], stalls: YardStall[]): Point[][] {
  const lanes: Point[][] = [gateRoute(), [SCALE_HOLD, SCALE_STOP]];
  for (const d of docks) lanes.push(approachRoute('scale', d), pulloutRoute(d));
  if (stalls[0]) lanes.push(stallRoute(stalls[0]), unparkRoute(stalls[0]));
  return lanes;
}
