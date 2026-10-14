import { buildPintoLayout, forEachRackSlot } from '../src/lib/layout/pinto-layout';
import { createInitialState } from '../src/lib/sim/init';
const layout = buildPintoLayout();
for (const r of [0.85, 0.6, 0.45]) {
  const s = createInitialState(layout, 20260301, { picking: 0.85, reserve: r });
  const inb = s.demand.inbound.reduce((a, x) => a + x.paletsCount, 0);
  let l0 = 0, up = 0; forEachRackSlot(layout, (sl) => (sl.level === 0 ? l0++ : up++));
  const freeUp = s.freeRack.filter((id) => (s.slotPos[id]?.level ?? 0) > 0).length;
  console.log(`reserva ${r}: camiones entrada ${s.demand.inbound.length}, palés entrada/día ${inb}, nivel0 ${l0}, reserva ${up}, reserva libre ${freeUp}, ocupación ${(100 * Object.keys(s.rackOccupancy).length / (l0 + up)).toFixed(1)}%`);
}
