// Temporal (agente B): plazas de reposo y sala anexa.
// Uso: tsx scripts/_b-annex.ts [normal|estres] [horaFin]
// - normal: arranque tal cual; cuenta máquinas en la anexa a lo largo del día.
// - estres: se bloquean todas las plazas de la sala principal menos 8 para forzar el uso de la anexa.
// Comprueba: ninguna plaza ocupada dos veces, las máquinas que van a una plaza llegan, y las que entran en la anexa salen.
import { ANNEX_RECT, ANNEX_ROOM_ID, buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';

const mode = process.argv[2] ?? 'normal';
const endH = Number(process.argv[3] ?? 16);
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const annexIds = new Set(layout.rooms.find((r) => r.id === ANNEX_ROOM_ID)!.spots.map((p) => p.id));
const allSpots = new Map(layout.rooms.flatMap((r) => r.spots).map((p) => [p.id, p]));
const inAnnexArea = (x: number, z: number) => x < ANNEX_RECT.xMax - 0.5 && x > ANNEX_RECT.xMin && z > ANNEX_RECT.zMin && z < ANNEX_RECT.zMax;

const initAnnex = s.machines.filter((m) => m.spot && annexIds.has(m.spot)).length;
const initMain = s.machines.filter((m) => m.spot && !annexIds.has(m.spot)).length;
console.log(`06:00 inicial: ${initMain} en sala principal, ${initAnnex} en anexa, ${s.machines.filter((m) => !m.spot).length} sin plaza`);

if (mode === 'estres') {
  // Todas las máquinas sueltan la plaza; se bloquean todas las de la principal salvo 8 con ids ficticios.
  for (const m of s.machines) {
    if (m.spot) delete s.spotOccupancy[m.spot];
    m.spot = null;
    m.mission = null;
    m.idleSince = s.ts - 10000; // sin espera de gracia: buscan plaza al instante
  }
  let free = 8;
  for (const r of layout.rooms) {
    if (r.kind !== 'reposo' || r.id === ANNEX_ROOM_ID) continue;
    for (const p of r.spots) {
      if (free > 0 && p.z < -40) {
        free--;
        continue;
      }
      s.spotOccupancy[p.id] = 'BLOQ';
    }
  }
}

const errors: string[] = [];
const enteredAnnex = new Set<string>();
const leftAnnex = new Set<string>();
const assignedAt = new Map<string, number>(); // máquina → ts en que se le asignó plaza (en ruta)
let maxTravel = 0;
let maxTravelId = '';
let arrivals = 0;
let annexArrivals = 0;
let peakAnnex = 0;
const wasInAnnex = new Map<string, boolean>();
let lastSample = s.ts;
const report = new Set([7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
for (let h = 7; h <= endH; h++) {
  while (s.ts < h * 3600) {
    tick(s, deps, 0.1);
    if (s.ts - lastSample < 1) continue;
    lastSample = s.ts;
    // Unicidad de plaza: dos máquinas no pueden tener la misma, y la ocupación debe apuntar a quien la tiene.
    const owners = new Map<string, string>();
    for (const m of s.machines) {
      if (!m.spot) continue;
      if (owners.has(m.spot)) errors.push(`${Math.round(s.ts)} plaza ${m.spot} doble: ${owners.get(m.spot)} y ${m.id}`);
      owners.set(m.spot, m.id);
      if (s.spotOccupancy[m.spot] !== m.id) errors.push(`${Math.round(s.ts)} ${m.id} tiene ${m.spot} pero ocupación=${s.spotOccupancy[m.spot]}`);
      const sp = allSpots.get(m.spot)!;
      const there = Math.hypot(m.pos.x - sp.x, m.pos.z - sp.z) < 1.2 && m.route.length === 0;
      if (!there) {
        if (!assignedAt.has(m.id)) assignedAt.set(m.id, s.ts);
      } else if (assignedAt.has(m.id)) {
        const dt = s.ts - assignedAt.get(m.id)!;
        if (dt > maxTravel) {
          maxTravel = dt;
          maxTravelId = `${m.id}→${m.spot}`;
        }
        assignedAt.delete(m.id);
        arrivals++;
        if (annexIds.has(m.spot)) annexArrivals++;
      }
    }
    for (const m of s.machines) if (!m.spot) assignedAt.delete(m.id);
    for (const [id, who] of Object.entries(s.spotOccupancy)) {
      if (who === 'BLOQ') continue;
      const m = s.machines.find((x) => x.id === who);
      if (!m || m.spot !== id) errors.push(`${Math.round(s.ts)} ocupación ${id}=${who} sin máquina que la tenga`);
    }
    for (const m of s.machines) {
      const inA = inAnnexArea(m.pos.x, m.pos.z);
      if (inA) enteredAnnex.add(m.id);
      if (wasInAnnex.get(m.id) && !inA) leftAnnex.add(m.id);
      wasInAnnex.set(m.id, inA);
    }
    const nA = s.machines.filter((m) => m.spot && annexIds.has(m.spot)).length;
    peakAnnex = Math.max(peakAnnex, nA);
    if (errors.length > 20) break;
  }
  if (report.has(h) || h === endH) {
    const nA = s.machines.filter((m) => m.spot && annexIds.has(m.spot)).length;
    const physA = s.machines.filter((m) => inAnnexArea(m.pos.x, m.pos.z)).length;
    const parked = s.machines.filter((m) => m.spot && allSpots.get(m.spot)?.kind === 'reposo').length;
    console.log(`${String(h % 24).padStart(2, '0')}:00 plaza en anexa ${nA} · físicamente en anexa ${physA} · con plaza de reposo ${parked} · en ruta a plaza ${assignedAt.size}`);
  }
  if (errors.length > 20) break;
}
const stillIn = s.machines.filter((m) => inAnnexArea(m.pos.x, m.pos.z));
const stuckInAnnex = stillIn.filter((m) => !(m.spot && annexIds.has(m.spot)) && m.route.length === 0);
const enroute = [...assignedAt.entries()].map(([id, t]) => `${id} ${Math.round(s.ts - t)}s`);
console.log(`Llegadas a plaza: ${arrivals} (anexa ${annexArrivals}) · viaje más largo ${Math.round(maxTravel)} s (${maxTravelId})`);
console.log(`En ruta al final: ${enroute.join(', ') || 'ninguna'}`);
console.log(`Pico de máquinas con plaza en anexa: ${peakAnnex}`);
console.log(`Entraron en la anexa: ${enteredAnnex.size} · salieron: ${leftAnnex.size} · siguen dentro: ${stillIn.length} (aparcadas allí ${stillIn.length - stuckInAnnex.length}, paradas sin plaza ${stuckInAnnex.length})`);
const neverLeft = [...enteredAnnex].filter((id) => !leftAnnex.has(id) && !stillIn.some((m) => m.id === id && m.spot && annexIds.has(m.spot)));
console.log(`Entraron y no salieron (sin estar aparcadas): ${neverLeft.length}`);
console.log(`Errores: ${errors.length}`);
for (const e of errors.slice(0, 10)) console.log('  ' + e);
