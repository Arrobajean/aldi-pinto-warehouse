import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { unparkRoute, stallRoute } from '../src/lib/sim/yard-routes';
import { truckCircles, TRUCK_CIRCLE_R } from '../src/lib/sim/traffic';
const layout = buildPintoLayout();
const stalls = layout.site.truckParking.stalls;
const st = stalls[Math.floor(stalls.length / 2)];
for (const [name, pts, rev] of [['unpark', unparkRoute(st), true], ['enter', stallRoute(st), false]] as const) {
  let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  const all = [{ x: st.x + st.width / 2, z: 139.5 }, ...pts];
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1], b = all[i];
    const h = rev ? Math.atan2(b.x - a.x, b.z - a.z) : Math.atan2(-(b.x - a.x), -(b.z - a.z));
    for (const c of truckCircles(b.x, b.z, h)) {
      zMin = Math.min(zMin, c.z - TRUCK_CIRCLE_R); zMax = Math.max(zMax, c.z + TRUCK_CIRCLE_R);
      xMin = Math.min(xMin, c.x - TRUCK_CIRCLE_R); xMax = Math.max(xMax, c.x + TRUCK_CIRCLE_R);
    }
  }
  console.log(name, 'stall x', st.x, 'w', st.width, 'cx', st.x + st.width / 2, { xMin, xMax, zMin, zMax }, name === 'enter' ? '(desde la báscula, solo la parte final cuenta)' : '');
}
