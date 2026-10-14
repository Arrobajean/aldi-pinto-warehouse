import { ANNEX_ROOM_ID, buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
import { makeDeps, tick } from '../src/lib/sim/tick';
const layout = buildPintoLayout();
const deps = makeDeps(layout);
const s = createInitialState(layout);
const annex = layout.rooms.find((r) => r.id === ANNEX_ROOM_ID)!;
const annexIds = new Set(annex.spots.map((p) => p.id));
for (const m of s.machines) { if (m.spot) delete s.spotOccupancy[m.spot]; m.spot = null; m.mission = null; m.idleSince = s.ts - 10000; }
let free = 8;
for (const r of layout.rooms) { if (r.kind !== 'reposo' || r.id === ANNEX_ROOM_ID) continue; for (const p of r.spots) { if (free > 0 && p.z < -40) { free--; continue; } s.spotOccupancy[p.id] = 'BLOQ'; } }
while (s.ts < 8 * 3600) tick(s, deps, 0.1);
for (const m of s.machines.filter((m) => m.spot && annexIds.has(m.spot)).slice(0, 6)) {
  const sp = annex.spots.find((p) => p.id === m.spot)!;
  console.log(m.id, m.status, m.mission, 'pos', m.pos.x.toFixed(2), m.pos.z.toFixed(2), 'spot', sp.id, sp.x, sp.z, 'route', JSON.stringify(m.route.slice(0, 3)), m.route.length);
}
