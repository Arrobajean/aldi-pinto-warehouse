import { getWorkerByMachineId } from '@/data/workersDatabase';
import { forEachRackSlot } from '@/lib/layout/pinto-layout';
import type { WarehouseLayout } from '@/lib/layout/types';
import { SIM_START_TS } from '@/lib/sim/clock';
import { generateDemand } from '@/lib/sim/demand';
import { buildSlotPositions } from '@/lib/sim/positions';
import { presupuestoTurno } from '@/lib/sim/preparacion';
import { assignSections, buildSectionIndex } from '@/lib/sim/sections';
import { seedYard } from '@/lib/sim/trucks';
import { createRosterMachines } from '@/lib/sim/work-roster';
import { PALLET_HEIGHT, shiftAt, type Machine, type Pallet, type SimState } from '@/lib/sim/types';
import { articleForSku, skuForAisle } from '@/lib/stock/catalog';
import type { ZoneId } from '@/lib/types';

const ZONE_TEMP: Record<ZoneId, 'dry' | 'cool' | 'frozen'> = {
  seco: 'dry',
  frio: 'cool',
  congelado: 'frozen',
  fyv: 'dry',
  expedicion: 'dry',
  carga_baterias: 'dry',
};

const OPERATORS = [
  'Carlos Moreno',
  'Lucía Santos',
  'David Gil',
  'Álvaro Martín',
  'Javier Pérez',
  'Elena Carrasco',
  'Marta Ruiz',
  'Pedro Navas',
  'Sergio Bravo',
  'Ana López',
  'Raúl Cuesta',
  'Laura Peña',
  'Óscar Vidal',
  'Nuria Campos',
];

const FLEET: { kind: Machine['kind']; base: number }[] = [
  { kind: 'retractil', base: 14 },
  { kind: 'frontal', base: 9 },
  { kind: 'recogepedidos', base: 12 },
  { kind: 'transpaleta', base: 6 },
];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Ocupación inicial de los racks (fracción de ubicaciones con palé al arrancar), por separado para el nivel de
 * picking (nivel 0) y para la reserva (niveles altos). No se parte de la nave llena: con hueco libre en reserva la
 * mercancía de proveedor entra y se ubica desde la primera hora, y el picking tiene género para preparar.
 * Medido (semilla 20260301): con reserva al 60 % la nave arranca al ~68 % y quedan ~4.700 huecos de reserva, más
 * que los ~2.800 palés de proveedor de un día; con el 85 % anterior quedaban ~1.800 y la reserva se llenaba el día 1.
 */
export const INITIAL_PICKING_FILL = 0.85;
export const INITIAL_RESERVE_FILL = 0.6;

export type InitialFill = { picking: number; reserve: number };

export function createInitialState(
  layout: WarehouseLayout,
  seed = 20260301,
  fill: InitialFill = { picking: INITIAL_PICKING_FILL, reserve: INITIAL_RESERVE_FILL },
): SimState {
  const rng = mulberry(seed);
  const slotPos = buildSlotPositions(layout);

  const pallets: Pallet[] = [];
  const paletById: Record<string, Pallet> = {};
  const rackOccupancy: Record<string, string> = {};
  const freeRack: string[] = [];

  const pickingByTemp: Record<'dry' | 'cool' | 'frozen', string[]> = { dry: [], cool: [], frozen: [] };
  const sections = buildSectionIndex(layout);
  const pickingBySection: Record<string, string[]> = {};
  const freeL0ByZone: Record<'seco' | 'frio' | 'congelado', string[]> = { seco: [], frio: [], congelado: [] };
  const storedByZone: Record<'seco' | 'frio' | 'congelado', number> = { seco: 0, frio: 0, congelado: 0 };

  let paletSeq = 0;
  forEachRackSlot(layout, (slot) => {
    const occupied = rng() < (slot.level === 0 ? fill.picking : fill.reserve);
    if (!occupied) {
      freeRack.push(slot.locationId);
      if (slot.level === 0 && slot.zoneId in freeL0ByZone) freeL0ByZone[slot.zoneId as 'seco' | 'frio' | 'congelado'].push(slot.locationId);
      return;
    }
    const id = `PL-${String(++paletSeq).padStart(5, '0')}`;
    const temp = ZONE_TEMP[slot.zoneId];
    // El artículo se asigna según el pasillo y familia (slotting logístico ALDI Pinto).
    const sku = skuForAisle(slot.aisleId, slot.zoneId, rng());
    // Antes aquí se sorteaba la familia: se conserva la llamada para no alterar la secuencia de la semilla.
    rng();
    const palet: Pallet = {
      id,
      sku,
      family: articleForSku(sku).family,
      temp,
      state: slot.level === 0 ? 'picking' : 'stored',
      locId: slot.locationId,
      pos: { x: slot.x, z: slot.z },
      height: PALLET_HEIGHT,
      receivedDay: Math.floor(rng() * 60),
      daysToExpiry: 5 + Math.floor(rng() * 120),
      batch: `L${String(24000 + Math.floor(rng() * 900)).padStart(5, '0')}`,
      quantity: 40 + Math.floor(rng() * 60),
    };
    pallets.push(palet);
    paletById[id] = palet;
    rackOccupancy[slot.locationId] = id;
    if (palet.state === 'picking') {
      pickingByTemp[palet.temp].push(id);
      const section = sections.sectionOfLoc.get(slot.locationId);
      if (section) (pickingBySection[section] ??= []).push(id);
    } else if (slot.zoneId === 'seco' || slot.zoneId === 'frio' || slot.zoneId === 'congelado') {
      storedByZone[slot.zoneId]++;
    }
  });

  // Flota inicial. Se reparten por la nave.
  const machines: Machine[] = [];
  // Las máquinas de almacén empiezan aparcadas en la sala de máquinas anexa (nunca dentro de un rack).
  const reposoSpots = layout.rooms.filter((r) => r.kind === 'reposo').flatMap((r) => r.spots);
  const spotOccupancy: Record<string, string> = {};
  const takeSpot = () => reposoSpots.find((s) => !spotOccupancy[s.id]);
  let mi = 0;
  for (const f of FLEET) {
    for (let i = 0; i < f.base; i++) {
      const prefix = { retractil: 'R', frontal: 'F', recogepedidos: 'P', transpaleta: 'E' }[f.kind];
      const id = `${prefix}-${String(i + 1).padStart(2, '0')}`;
      // Todas las máquinas empiezan aparcadas en la sala de máquinas.
      const parked = takeSpot();
      if (parked) spotOccupancy[parked.id] = id;
      // Sin plaza libre (no ocurre: hay 76 plazas de reposo para 41 máquinas y hasta 28 preparadores), se queda en el centro de la primera calle de la sala de máquinas.
      const pos = parked ? { x: parked.x, z: parked.z } : { x: -115.3, z: -60.2 };
      machines.push({
        id,
        kind: f.kind,
        operatorName: getWorkerByMachineId(id)?.name ?? OPERATORS[mi++ % OPERATORS.length],
        status: 'idle',
        battery: 60 + rng() * 40,
        pos,
        // Aparcada en horizontal mirando hacia la pared oeste (-X).
        heading: parked ? -Math.PI / 2 : rng() * Math.PI * 2,
        taskId: null,
        route: [],
        speed: 0,
        hasPalet: false,
        liftHeight: 0,
        liftTarget: 0,
        aisleReserved: null,
        spot: parked?.id ?? null,
        mission: null,
        hoursUsed: 0,
        workingRemaining: 0,
        carriedPalets: [],
        batteryEventSent: false,
        waitingOnce: false,
        // Fichaje escalonado: cada operario tarda 0–150 s en empezar a aceptar tareas.
        clockInDelay: rng() * 150,
      });
    }
  }

  const dockStates = layout.docks.map((d) => ({
    dockId: d.id,
    truckId: null,
    state: 'free' as const,
    paletsProcessed: 0,
    totalPalets: 0,
  }));

  // Palets de FyV en el suelo se conservan como picking (no en rack).
  const startTs = SIM_START_TS;

  const state: SimState = {
    ts: startTs,
    running: true,
    speed: 1,
    startTs,
    seed,
    rngState: seed,
    shiftId: shiftAt(startTs).id,
    lastShiftChange: startTs,
    preparacion: { turno: shiftAt(startTs).id, restante: presupuestoTurno(shiftAt(startTs).id, rng) },
    machines,
    trucks: [],
    pallets,
    paletById,
    tasks: [],
    dockStates,
    events: [],
    aisleLocks: {},
    spotOccupancy,
    rackOccupancy,
    rackDirty: [],
    freeRack,
    slotPos,
    lanePallets: {},
    strappers: layout.strappers.map((s) => ({ id: s.id, queue: [], current: null })),
    strapOut: [],
    demand: generateDemand(layout, seed + 7),
    stats: { received: 0, stored: 0, picked: 0, prepared: 0, shipped: 0, trucksOut: 0 },
    seq: { truck: 0, palet: paletSeq, task: 0 },
    spawnedInbound: 0,
    outOrdersSpawned: 0,
    lanzados: {},
    outboundDone: [],
    stagingQueue: [],
    pickingByTemp,
    pickingBySection,
    pickRemaining: {},
    pickCarne: {},
    consolidation: {},
    freeL0ByZone,
    storedByZone,
    genTimer: 0,
    stallOccupancy: {},
    lastGateAt: startTs - 3600,
    scaleTruckId: null,
    lastStallExitAt: startTs - 3600,
    lastSpotReleaseAt: startTs - 3600,
    zoneClaims: [],
  };
  // Preparadores y retráctiles dedicados a una sección.
  assignSections(machines, sections);
  // Preparadores de la plantilla (P-13…P-40) en las plazas de reposo libres, sin consumir el generador aleatorio.
  createRosterMachines(state, layout);
  // El turno no empieza con el patio vacío: camiones en espera y descargando.
  seedYard(state, layout);
  return state;
}

export { mulberry };

export { nextRandom } from '@/lib/sim/rng';
