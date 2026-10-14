/** Paso de cada máquina: asignación de tareas, batería y avance de la tarea en curso. (extraído de tick.ts) */
import { type SimDeps } from '@/lib/sim/deps';
import { emitEvent } from '@/lib/sim/events';
import { type HandlingMachine, startHandling, stepHandling, stopPoint } from '@/lib/sim/handling';
import { CHARGED_LEVEL, SPOT_RELEASE_GAP, releaseAisle, releaseSpot, updateIdle } from '@/lib/sim/machine-idle';
import { LIFT_SPEED, liftLocFor, moveAlong, slotHeight } from '@/lib/sim/machine-motion';
import { aisleAt } from '@/lib/sim/machine-routes';
import { beginTask } from '@/lib/sim/machine-task-begin';
import { completeTask } from '@/lib/sim/machine-task-complete';
import { park } from '@/lib/sim/navigator';
import { type Machine, type SimState, type SimTask, shiftAt } from '@/lib/sim/types';

/** Contadores de un paso de simulación compartidos por todas las máquinas. */
export interface MachineTickCtx {
  /** Equipos con tarea que cuentan en el tope del turno (ver `cuentaEnTope`). */
  active: number;
  /** Tareas por id al empezar el paso (las que se crean durante el paso se buscan en la lista). */
  taskById: Map<string, SimTask>;
}

export const taskIndexCache = new WeakMap<SimTask[], Map<string, SimTask>>();

/** Índice de tareas por id de la lista actual (se rehace cuando se rehace la lista). */
export function taskIndex(state: SimState): Map<string, SimTask> {
  let idx = taskIndexCache.get(state.tasks);
  if (!idx) {
    idx = new Map(state.tasks.map((t) => [t.id, t]));
    taskIndexCache.set(state.tasks, idx);
  }
  return idx;
}

/** Tarea por id: del índice del paso o, si se ha creado después, de la lista. */
export function taskOf(state: SimState, ctx: MachineTickCtx, id: string): SimTask | undefined {
  const t = ctx.taskById.get(id);
  if (t) return t;
  const found = state.tasks.find((x) => x.id === id);
  if (found) ctx.taskById.set(id, found);
  return found;
}

/**
 * ¿Cuenta la máquina en el tope de equipos activos del turno? Solo retráctiles y transpaletas: los ERE de muelle
 * son una cuadrilla aparte (un camión atracado no puede esperar) y los preparadores ya los limita la plantilla
 * presente del turno (ver work-roster.ts).
 */
export function cuentaEnTope(m: Machine): boolean {
  return m.kind !== 'frontal' && m.kind !== 'recogepedidos';
}

/**
 * Una máquina acepta tareas si es turno de día, ya ha fichado (retraso escalonado desde el inicio del turno),
 * no se supera el número de equipos activos del turno (`SHIFTS[].machines`, ver `cuentaEnTope`) y, si está
 * aparcada, le toca salir de la sala.
 */
export function canTakeTask(state: SimState, m: Machine, ctx: MachineTickCtx): boolean {
  const shift = shiftAt(state.ts);
  if (shift.id === 'noche') return false;
  if (state.ts < state.lastShiftChange + m.clockInDelay) return false;
  if (cuentaEnTope(m) && ctx.active >= shift.machines) return false;
  const parked = m.spot !== null && m.route.length === 0;
  if (parked && state.ts - state.lastSpotReleaseAt < SPOT_RELEASE_GAP) return false;
  return true;
}

export function updateMachine(state: SimState, deps: SimDeps, m: Machine, dt: number, ctx: MachineTickCtx) {
  // Parada (sin ruta): retiene su celda de navegación para que las demás la rodeen.
  if (m.route.length === 0) park(state, deps.nav, m, state.machines.indexOf(m));
  // La reserva del pasillo se suelta al salir de él (no al pararse a trabajar dentro).
  if (m.aisleReserved && aisleAt(deps, m.pos.x, m.pos.z) !== m.aisleReserved && m.status !== 'traveling' && m.status !== 'waiting') releaseAisle(state, m);

  // La horquilla sube o baja hacia su altura objetivo con velocidad limitada.
  const liftDiff = m.liftTarget - m.liftHeight;
  m.liftHeight += Math.sign(liftDiff) * Math.min(Math.abs(liftDiff), LIFT_SPEED * dt);

  // Batería y recarga: la máquina permanece en su plaza de carga.
  if (m.status === 'charging') {
    m.battery = Math.min(100, m.battery + dt * 0.8);
    m.route = [];
    if (m.battery >= CHARGED_LEVEL) {
      m.status = 'idle';
      releaseSpot(state, m);
    }
    return;
  }
  m.battery = Math.max(0, m.battery - dt * 0.0028);
  m.hoursUsed += dt / 3600;

  if (!m.taskId) {
    if (m.battery < 20 && !m.batteryEventSent) {
      m.batteryEventSent = true;
      emitEvent(state, 'machine_low_battery', `${m.id} (${m.operatorName}) con ${Math.round(m.battery)}% — va a recargar`);
    }
    // Fuera de turno (noche) no se asignan tareas: la máquina termina y aparca en la sala de máquinas.
    const assigned = canTakeTask(state, m, ctx) && deps.dispatch.assignTask(state, m);
    if (assigned) {
      m.idleSince = undefined;
      if (cuentaEnTope(m)) ctx.active++;
      // Las máquinas aparcadas salen de la sala de una en una.
      if (m.spot && m.route.length === 0) state.lastSpotReleaseAt = state.ts;
      // Sale de la plaza de sala (o abandona el trayecto hacia ella) para trabajar.
      releaseSpot(state, m);
      m.route = [];
      const task = taskOf(state, ctx, m.taskId!);
      if (task) beginTask(state, deps, m, task);
      return;
    }
    updateIdle(state, deps, m, dt);
    return;
  }

  const task = taskOf(state, ctx, m.taskId);
  if (!task) {
    m.taskId = null;
    return;
  }

  const hm = m as HandlingMachine;
  if (hm.stops !== undefined) {
    if (hm.handling) {
      m.status = 'working';
      task.state = 'working';
      m.speed = 0;
      const finished = stepHandling(state, hm, dt);
      if (finished) {
        if (hm.stops.length > 0) {
          const nextStop = hm.stops[0];
          m.route = [stopPoint(nextStop)];
          m.status = 'traveling';
          task.state = 'transit';
        } else {
          completeTask(state, deps, m, task);
          if (cuentaEnTope(m)) ctx.active--;
        }
      }
      return;
    }

    if (hm.stops.length > 0) {
      const arrived = moveAlong(state, deps, m, dt);
      if (arrived) {
        startHandling(hm);
      }
      return;
    }
  }

  if (task.state === 'transit') {
    const arrived = moveAlong(state, deps, m, dt);
    if (arrived) {
      m.status = 'working';
      m.liftTarget = slotHeight(state, liftLocFor(state, task));
      task.state = 'working';
      m.workingRemaining = task.duration;
    }
    return;
  }

  if (task.state === 'working') {
    m.workingRemaining -= dt;
    if (m.workingRemaining <= 0) {
      completeTask(state, deps, m, task);
      if (cuentaEnTope(m)) ctx.active--;
    }
  }
}
