/** Línea de tiempo de una maniobra (coger o dejar): tiempos, elevaciones y poses de las horquillas. (extraído de handling.ts) */

import { CARRY_CENTER, CARRY_LIFT, FLOOR_LIFT, REACH_MAX, TRANSFER_LIFT } from '@/lib/sim/handling-constants';
import type { HandlingPlan, HandlingPose, PlanKey, Stop, StopWhere } from '@/lib/sim/handling-types';
import type { MachineKind } from '@/lib/sim/types';

const T_TURN = 0.9;
/** Lectura de la etiqueta / confirmación en el terminal antes de coger o tras dejar (s): en rack, suelo o flejadora. */
const T_SCAN: Record<StopWhere, number> = { rack: 2.5, floor: 1.2, trailer: 1.2, strapper: 1.2 };
const T_TRANSFER = 0.45;
const V_LIFT = 0.5;
const V_LOWER = 0.6;
const V_REACH = 0.55;
const V_DRIVE = 1.3;

/** Avance necesario para que el palé quede donde está el hueco. */
export function extensionFor(kind: MachineKind, depth: number): number {
  if (kind === 'retractil') return Math.min(REACH_MAX, Math.max(0, depth - CARRY_CENTER.retractil));
  return Math.max(0, depth - CARRY_CENTER[kind]);
}

/** Cota de las horquillas para entrar bajo el palé (o apoyarlo) a la altura `h`. */
function seatLift(h: number, laden: boolean): number {
  return h <= 0 ? (laden ? FLOOR_LIFT : 0) : h;
}

/**
 * Línea de tiempo de una maniobra. Coger: girar → subir a la cota → avanzar → despegar → retroceder → bajar.
 * Dejar: girar → subir (palé despegado) → avanzar → apoyar → retroceder → bajar.
 */
export function planHandling(kind: MachineKind, stop: Stop, laden: boolean): HandlingPlan {
  const take = stop.kind === 'take';
  const ext = extensionFor(kind, stop.depth);
  const vExt = kind === 'retractil' ? V_REACH : V_DRIVE;
  const seat = seatLift(stop.height, laden || !take);
  const start = take ? (laden ? CARRY_LIFT : 0) : CARRY_LIFT;
  const keys: PlanKey[] = [{ t: 0, lift: start, ext: 0 }];
  let t = 0;
  let lift = start;
  const go = (dt: number, nl: number, ne: number) => {
    t += Math.max(0, dt);
    lift = nl;
    keys.push({ t, lift: nl, ext: ne });
  };
  const rate = (from: number, to: number) => Math.abs(to - from) / (to > from ? V_LIFT : V_LOWER);
  let e = 0;

  go(T_TURN, lift, e);
  if (take) go(T_SCAN[stop.where], lift, e);
  const approachLift = take ? seat : seat + TRANSFER_LIFT;
  go(rate(lift, approachLift), approachLift, e);
  e = ext;
  go(ext / vExt, lift, e);
  const afterLift = take ? seat + TRANSFER_LIFT : seat;
  go(T_TRANSFER, afterLift, e);
  const transferT = t;
  if (!take) go(T_SCAN[stop.where] * 0.5, lift, e);
  e = 0;
  go(ext / vExt, lift, e);
  const rest = take ? CARRY_LIFT : 0;
  go(rate(lift, rest), rest, e);
  return { keys, transferT, total: t, maxExt: ext };
}

/** Pose de las horquillas `t` segundos después de empezar la maniobra. */
export function poseAt(plan: HandlingPlan, t: number): HandlingPose {
  const k = plan.keys;
  const tt = Math.max(0, Math.min(plan.total, t));
  let i = 1;
  while (i < k.length - 1 && k[i].t < tt) i++;
  const a = k[i - 1];
  const b = k[i];
  const f = b.t > a.t ? Math.max(0, Math.min(1, (tt - a.t) / (b.t - a.t))) : 1;
  const sf = f * f * (3 - 2 * f);
  return { lift: a.lift + (b.lift - a.lift) * sf, ext: a.ext + (b.ext - a.ext) * sf, transferred: tt >= plan.transferT };
}

/** Duración de una maniobra (s): la que la simulación espera antes de seguir. */
export function handlingSeconds(kind: MachineKind, stop: Stop, laden: boolean): number {
  return planHandling(kind, stop, laden).total;
}
