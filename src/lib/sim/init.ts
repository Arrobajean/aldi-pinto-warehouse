import type { WarehouseLayout } from '@/lib/layout/types';
import type { ZoneId } from '@/lib/types';
import { forEachRackSlot } from '@/lib/layout/pinto-layout';
import { SIM_START_TS } from '@/lib/sim/clock';
import { generateDemand } from '@/lib/sim/demand';
import { buildSlotPositions } from '@/lib/sim/positions';
import type { Machine, Pallet, SimState } from '@/lib/sim/types';

const ZONE_TEMP: Record<ZoneId, 'dry' | 'cool' | 'frozen'> = {
  seco: 'dry',
  frio: 'cool',
  congelado: 'frozen',
  fyv: 'dry',
  expedicion: 'dry',
  carga_baterias: 'dry',
};

const FAMILIES = ['conservas', 'bebidas', 'bazar', 'legumbres', 'aceites', 'lácteos', 'congelados', 'fyv'];
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

export function createInitialState(layout: WarehouseLayout, seed = 20260301): SimState {
  const rng = mulberry(seed);
  const slotPos = buildSlotPositions(layout);

  const pallets: Pallet[] = [];
  const paletById: Record<string, Pallet> = {};
  const rackOccupancy: Record<string, string> = {};
  const freeRack: string[] = [];

  const pickingByTemp: Record<'dry' | 'cool' | 'frozen', string[]> = { dry: [], cool: [], frozen: [] };
  const freeL0ByZone: Record<'seco' | 'frio' | 'congelado', string[]> = { seco: [], frio: [], congelado: [] };
  const storedByZone: Record<'seco' | 'frio' | 'congelado', number> = { seco: 0, frio: 0, congelado: 0 };

  let paletSeq = 0;
  forEachRackSlot(layout, (slot) => {
    const occupied = rng() < 0.85;
    if (!occupied) {
      freeRack.push(slot.locationId);
      if (slot.level === 0 && slot.zoneId in freeL0ByZone) freeL0ByZone[slot.zoneId as 'seco' | 'frio' | 'congelado'].push(slot.locationId);
      return;
    }
    const id = `PL-${String(++paletSeq).padStart(5, '0')}`;
    const palet: Pallet = {
      id,
      sku: `SKU-${Math.floor(rng() * 1800) + 1000}`,
      family: FAMILIES[Math.floor(rng() * FAMILIES.length)],
      temp: ZONE_TEMP[slot.zoneId],
      state: slot.level === 0 ? 'picking' : 'stored',
      locId: slot.locationId,
      pos: { x: slot.x, z: slot.z },
      height: 1.0 + rng() * 0.5,
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
    } else if (slot.zoneId === 'seco' || slot.zoneId === 'frio' || slot.zoneId === 'congelado') {
      storedByZone[slot.zoneId]++;
    }
  });

  // Flota inicial. Se reparten por la nave.
  const machines: Machine[] = [];
  let mi = 0;
  for (const f of FLEET) {
    for (let i = 0; i < f.base; i++) {
      const id = `${f.kind === 'retractil' ? 'R' : f.kind === 'frontal' ? 'F' : 'P'}-${String(i + 1).padStart(2, '0')}`;
      const pos =
        f.kind === 'retractil'
          ? { x: -115 + rng() * 30, z: -40 + rng() * 10 }
          : f.kind === 'frontal'
            ? { x: -110 + rng() * 240, z: 60 + rng() * 12 }
            : { x: -10 + rng() * 120, z: -5 + rng() * 30 };
      machines.push({
        id,
        kind: f.kind,
        operatorName: OPERATORS[mi++ % OPERATORS.length],
        status: 'idle',
        battery: 60 + rng() * 40,
        pos,
        heading: rng() * Math.PI * 2,
        taskId: null,
        route: [],
        speed: 0,
        hasPalet: false,
        liftHeight: 0,
        liftTarget: 0,
        aisleReserved: null,
        spot: null,
        mission: null,
        hoursUsed: 0,
        workingRemaining: 0,
        carriedPalets: [],
        batteryEventSent: false,
        waitingOnce: false,
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

  return {
    ts: startTs,
    running: true,
    speed: 1,
    startTs,
    seed,
    rngState: seed,
    shiftId: 'noche',
    lastShiftChange: startTs,
    machines,
    trucks: [],
    pallets,
    paletById,
    tasks: [],
    dockStates,
    events: [],
    aisleLocks: {},
    spotOccupancy: {},
    rackOccupancy,
    rackDirty: [],
    freeRack,
    slotPos,
    lanePallets: {},
    demand: generateDemand(layout, seed + 7),
    stats: { received: 0, stored: 0, picked: 0, prepared: 0, shipped: 0, trucksOut: 0 },
    seq: { truck: 0, palet: paletSeq, task: 0 },
    spawnedInbound: 0,
    outOrdersSpawned: 0,
    outboundDone: [],
    stagingQueue: [],
    pickingByTemp,
    freeL0ByZone,
    storedByZone,
    genTimer: 0,
  };
}

export { mulberry };

/** RNG con estado serializable (contador) para uso dentro del bucle. */
export function nextRandom(state: { rngState: number }): number {
  let a = state.rngState >>> 0;
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = ((t ^ (t >>> 14)) >>> 0);
  return state.rngState / 4294967296;
}