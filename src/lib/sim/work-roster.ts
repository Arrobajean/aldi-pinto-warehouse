/**
 * Plantilla física de preparadores: un recogepedidos por preparador, hasta el máximo de presentes de un turno, y
 * en cada turno trabajan solo los que vienen (con las secciones de su zona); los demás se quedan en la sala.
 */
import { getWorkerByMachineId } from '@/data/workersDatabase';
import type { WarehouseLayout } from '@/lib/layout/types';
import type { SimDeps } from '@/lib/sim/deps';
import { PREPARADORES_POR_TURNO_Y_ZONA, type TurnoId, type ZonaPreparacion } from '@/lib/sim/preparacion';
import { buildSectionIndex, type SectionIndex } from '@/lib/sim/sections';
import type { Machine, SimState } from '@/lib/sim/types';
import { asegurarDemandaDiaSiguiente } from '@/lib/sim/work-dia-siguiente';

const ZONAS: ZonaPreparacion[] = ['dry', 'cool', 'frozen'];

/** Máximo de preparadores presentes a la vez en algún turno: los recogepedidos que hacen falta. */
export function maxPreparadores(): number {
  return Math.max(...Object.values(PREPARADORES_POR_TURNO_Y_ZONA).map((z) => ZONAS.reduce((a, k) => a + z[k], 0)));
}

/** Recogepedidos de la plantilla, en orden de id (P-01, P-02…). */
function recogepedidos(state: SimState): Machine[] {
  return state.machines.filter((m) => m.kind === 'recogepedidos').sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Crea, al arrancar, los recogepedidos que faltan hasta el máximo de presentes. Empiezan aparcados en plazas
 * libres de la sala de máquinas; sin plaza libre no se crean. No usa el generador aleatorio (batería y fichaje
 * salen del número de máquina), para no alterar la secuencia de la semilla.
 */
export function createRosterMachines(state: SimState, layout: WarehouseLayout): void {
  const actuales = recogepedidos(state);
  const plantilla = actuales[0];
  if (!plantilla) return;
  const ocupadas = new Set(Object.keys(state.spotOccupancy));
  const libres = layout.rooms.filter((r) => r.kind === 'reposo').flatMap((r) => r.spots).filter((p) => !ocupadas.has(p.id));
  for (let n = actuales.length + 1; n <= maxPreparadores() && libres.length > 0; n++) {
    const plaza = libres.shift()!;
    const id = `P-${String(n).padStart(2, '0')}`;
    state.spotOccupancy[plaza.id] = id;
    state.machines.push({
      ...plantilla,
      id,
      operatorName: getWorkerByMachineId(id)?.name ?? `Preparador ${id}`,
      status: 'idle',
      battery: 60 + ((n * 37) % 40),
      pos: { x: plaza.x, z: plaza.z },
      heading: -Math.PI / 2,
      taskId: null,
      route: [],
      speed: 0,
      hasPalet: false,
      liftHeight: 0,
      liftTarget: 0,
      aisleReserved: null,
      spot: plaza.id,
      mission: null,
      hoursUsed: 0,
      workingRemaining: 0,
      carriedPalets: [],
      batteryEventSent: false,
      waitingOnce: false,
      clockInDelay: (n * 53) % 150,
      sections: [],
      idleSince: undefined,
      cell: undefined,
    });
  }
  // Los presentes del turno de arranque.
  activarTurno(state, buildSectionIndex(layout), state.preparacion.turno);
}

/**
 * Turno nuevo: los primeros recogepedidos se reparten por zona según los presentes del turno (seco, frío y
 * congelado, en ese orden) y trabajan cualquier sección de su zona; los demás no tienen sección, así que no toman
 * lotes y se quedan aparcados. Un preparador que está a mitad de lote lo termina.
 */
export function activarTurno(state: SimState, sections: SectionIndex, turno: TurnoId): void {
  const presentes = PREPARADORES_POR_TURNO_Y_ZONA[turno];
  const lista = recogepedidos(state);
  let i = 0;
  for (const zona of ZONAS) {
    const secciones = sections.sectionsByTemp[zona].map((s) => s.section);
    for (let k = 0; k < presentes[zona] && i < lista.length; k++) lista[i++].sections = [...secciones];
  }
  for (; i < lista.length; i++) lista[i].sections = [];
}

/** Preparadores trabajando por zona en el turno en curso (para comprobaciones). */
export function presentesPorZona(state: SimState, sections: SectionIndex): Record<ZonaPreparacion, number> {
  const out: Record<ZonaPreparacion, number> = { dry: 0, cool: 0, frozen: 0 };
  for (const m of recogepedidos(state)) {
    const zona = ZONAS.find((z) => sections.sectionsByTemp[z].some((s) => m.sections?.includes(s.section)));
    if (zona) out[zona]++;
  }
  return out;
}

/**
 * Cambio de turno: entran los preparadores del turno nuevo y, si aún no están, se cargan los pedidos del día
 * siguiente (para prepararlos por adelantado cuando sobre capacidad).
 */
export function alCambiarTurno(state: SimState, deps: SimDeps): void {
  activarTurno(state, deps.sections, state.preparacion.turno);
  asegurarDemandaDiaSiguiente(state, deps.layout);
}
