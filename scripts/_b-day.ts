// Temporal (agente B): día completo 06:00 → fin con ocupación inicial configurable.
// Uso: tsx scripts/_b-day.ts <picking> <reserva> [horaFin]
import { buildPintoLayout, ANNEX_ROOM_ID } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';

const layout = buildPintoLayout();
const deps = makeDeps(layout);
const picking = Number(process.argv[2] ?? 0.85);
const reserve = Number(process.argv[3] ?? 0.85);
const endH = Number(process.argv[4] ?? 22);
const seed = Number(process.argv[5] ?? 20260301);
const s = createInitialState(layout, seed, { picking, reserve });
const totalLocs = Object.keys(s.rackOccupancy).length + s.freeRack.length;
const annexIds = new Set(layout.rooms.find((r) => r.id === ANNEX_ROOM_ID)?.spots.map((p) => p.id) ?? []);
const seenIn = new Set<string>();
const goneIn = new Set<string>();
const seenOut = new Set<string>();
const goneOut = new Set<string>();
let lastCheck = s.ts;
const occ = () => (100 * Object.keys(s.rackOccupancy).length) / totalLocs;
console.log(`semilla ${seed} · fill picking ${picking} reserva ${reserve} · ubicaciones ${totalLocs} · ocupación inicial ${occ().toFixed(1)} %`);
let prevPrep = 0;
for (let h = 7; h <= endH; h++) {
  while (s.ts < h * 3600) {
    tick(s, deps, 0.1);
    if (s.ts - lastCheck >= 30) {
      lastCheck = s.ts;
      const now = new Set(s.trucks.map((t) => t.id));
      for (const t of s.trucks) (t.direction === 'inbound' ? seenIn : seenOut).add(t.id);
      for (const id of seenIn) if (!now.has(id)) goneIn.add(id);
      for (const id of seenOut) if (!now.has(id)) goneOut.add(id);
    }
  }
  const inAnnex = s.machines.filter((m) => m.spot && annexIds.has(m.spot)).length;
  console.log(
    `${String(h).padStart(2)}:00 occ ${occ().toFixed(1)}% · salidas ${s.stats.trucksOut} · entradas fuera ${goneIn.size} · prep +${s.stats.prepared - prevPrep} (${s.stats.prepared}) · recib ${s.stats.received} · ubic ${s.stats.stored} · pick ${s.stats.picked} · patio ${s.trucks.length} · anexa ${inAnnex}`,
  );
  prevPrep = s.stats.prepared;
}
