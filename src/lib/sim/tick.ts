export type { SimDeps } from '@/lib/sim/deps';

/** Paso de simulación: reloj, turnos, camiones, máquinas y trabajo pendiente. (extraído de tick.ts) */
import { forEachRackSlot, rackRects } from '@/lib/layout/pinto-layout';
import type { WarehouseLayout } from '@/lib/layout/types';
import { areaTemps } from '@/lib/sim/consolidation';
import { type SimDeps } from '@/lib/sim/deps';
import { simpleDispatch } from '@/lib/sim/dispatch';
import { emitEvent } from '@/lib/sim/events';
import { nextRandom } from '@/lib/sim/init';
import { SLOT_STOP_OFFSET } from '@/lib/sim/machine-routes';
import { type MachineTickCtx, cuentaEnTope, taskIndex, updateMachine } from '@/lib/sim/machine-update';
import { buildNavGrid } from '@/lib/sim/navgrid';
import { PathFinder } from '@/lib/sim/path';
import { presupuestoTurno } from '@/lib/sim/preparacion';
import { buildSectionIndex } from '@/lib/sim/sections';
import { releaseZones } from '@/lib/sim/traffic';
import { spawnOutboundIfRoom, updateInboundSpawns, updateTruck } from '@/lib/sim/trucks';
import { type Point, type SimState, shiftAt } from '@/lib/sim/types';
import { generateWork } from '@/lib/sim/work';
import { alCambiarTurno } from '@/lib/sim/work-roster';

export function tick(state: SimState, deps: SimDeps, dt: number) {
  state.ts += dt;

  // Cambio de turno.
  const period = shiftAt(state.ts);
  if (period.id !== state.shiftId) {
    const prev = state.shiftId;
    state.shiftId = period.id;
    state.lastShiftChange = state.ts;
    state.preparacion = { turno: period.id, restante: presupuestoTurno(period.id, () => nextRandom(state)) };
    // Entran los preparadores del turno y se cargan los pedidos del día siguiente.
    alCambiarTurno(state, deps);
    emitEvent(state, 'shift_change', `Cambio de turno: ${prev} → ${period.id}`);
  }

  // Camiones nuevos.
  const spawned = updateInboundSpawns(state, deps.layout);
  spawnOutboundIfRoom(state, deps.layout);
  void spawned;

  // Máquinas.
  const ctx: MachineTickCtx = {
    active: state.machines.filter((m) => m.taskId !== null && cuentaEnTope(m)).length,
    taskById: taskIndex(state),
  };
  for (const m of state.machines) updateMachine(state, deps, m, dt, ctx);

  // Camiones.
  for (const t of [...state.trucks]) {
    updateTruck(state, deps, t, dt);
    releaseZones(state, t);
    if (t.status === 'done') {
      state.trucks = state.trucks.filter((x) => x !== t);
    }
  }

  // Limpieza de tareas terminadas (la lista solo se rehace si hay alguna: así conserva su índice por id).
  if (state.tasks.some((t) => t.state === 'done')) state.tasks = state.tasks.filter((t) => t.state !== 'done');

  // La generación de trabajo se espacia para no escanear índices en cada paso.
  state.genTimer += dt;
  if (state.genTimer >= 0.5) {
    state.genTimer = 0;
    generateWork(state, deps);
  }
}

export function makeDeps(layout: WarehouseLayout): SimDeps {
  // Tramos de pasillo: uno por segmento de rack entre transversales (los transversales y la calle norte no son
  // pasillo), con el eje real del pasillo y 0,3 m de margen en las bocas.
  const aisleX = new Map(layout.aisles.map((a) => [a.id, a.xCenter]));
  const bySegment = new Map<string, { xCenter: number; zMin: number; zMax: number }>();
  for (const line of layout.rackLines) {
    const xCenter = aisleX.get(line.aisleId);
    if (xCenter === undefined) continue;
    for (const seg of line.segments) {
      const id = `${line.aisleId}@${seg.zStart.toFixed(1)}`;
      const existing = bySegment.get(id) ?? { xCenter, zMin: Infinity, zMax: -Infinity };
      existing.zMin = Math.min(existing.zMin, seg.zStart + 0.3);
      existing.zMax = Math.max(existing.zMax, seg.zEnd - 0.3);
      bySegment.set(id, existing);
    }
  }
  const aisles = [...bySegment.entries()].map(([id, a]) => ({ id, ...a }));
  // Puesto frente al hueco: en el pasillo del rack, desplazado hacia él (no en el eje, para dejar paso).
  const slotStops = new Map<string, Point>();
  forEachRackSlot(layout, (slot) => {
    const ax = aisleX.get(slot.aisleId) ?? slot.x;
    slotStops.set(slot.locationId, { x: ax + Math.sign(slot.x - ax) * SLOT_STOP_OFFSET, z: slot.z });
  });
  return {
    layout,
    indoor: new PathFinder(layout.indoorGraph, rackRects(layout.rackLines)),
    yard: new PathFinder(layout.yardGraph),
    dispatch: simpleDispatch,
    aisles,
    slotStops,
    sections: buildSectionIndex(layout),
    nav: buildNavGrid(layout),
    dockById: new Map(layout.docks.map((d) => [d.id, d])),
    strapperById: new Map(layout.strappers.map((s) => [s.id, s])),
    consolidationById: new Map(layout.consolidation.map((c) => [c.id, c])),
    consolidationByTemp: new Map(
      layout.consolidation.flatMap((c) => {
        const temps = areaTemps(c);
        return temps ? temps.map((t) => [t, c] as const) : [['dry' as const, c] as const];
      }),
    ),
  };
}
