import { buildPintoLayout, forEachRackSlot } from '../src/lib/layout/pinto-layout';
import { rectArea } from '../src/lib/layout/types';
import { STORES } from '../src/lib/data/stores';

const layout = buildPintoLayout();

const zoneSurfaces = layout.zones.map((z) => ({ id: z.id, label: z.label, m2: Math.round(rectArea(z.rect)) }));
const sumZones = zoneSurfaces.reduce((a, b) => a + b.m2, 0);

let slots = 0;
const byZone: Record<string, number> = {};
forEachRackSlot(layout, (slot) => {
  slots++;
  byZone[slot.zoneId] = (byZone[slot.zoneId] ?? 0) + 1;
});

console.log('Parcela m²:', Math.round(rectArea(layout.parcel)));
console.log('Nave m²:', layout.stats.surface);
console.log('Zonas:', JSON.stringify(zoneSurfaces), 'suma:', sumZones);
console.log('Aisles:', layout.stats.aisleCount, layout.aisles.length);
console.log('Rack lines:', layout.rackLines.length);
console.log('Muelles:', layout.stats.dockCount, 'inbound:', layout.docks.filter((d) => d.kind === 'inbound').length);
console.log('Slots rack por zona:', JSON.stringify(byZone));
console.log('Ubicaciones totales (slots rack):', slots);
console.log('Stats.locations:', layout.stats.locations, 'ocupados ~85%:', layout.stats.racksFilled);
console.log('Slots infra-graph:', layout.indoorGraph.nodes.length, 'nodos,', layout.indoorGraph.edges.length, 'aristas');
console.log('Slots yard-graph:', layout.yardGraph.nodes.length, 'nodos,', layout.yardGraph.edges.length, 'aristas');
console.log('Plazas semirremolques:', layout.site.truckParking.stalls.length);

// Salas: plazas por tipo y ninguna arista del grafo de sala cruza una plaza ajena.
const roomSpots = layout.rooms.flatMap((r) => r.spots);
console.log('Plazas carga:', roomSpots.filter((s) => s.kind === 'carga').length, 'reposo:', roomSpots.filter((s) => s.kind === 'reposo').length);
const nodePos = new Map(layout.indoorGraph.nodes.map((n) => [n.id, n]));
let roomCrossings = 0;
for (const e of layout.indoorGraph.edges) {
  const touchesRoom = [e.from, e.to].some((id) => id.startsWith('spot-') || id.startsWith('room-'));
  const a = nodePos.get(e.from);
  const b = nodePos.get(e.to);
  if (!touchesRoom || !a || !b) continue;
  const own = new Set([e.from, e.to].filter((id) => id.startsWith('spot-')).map((id) => id.slice('spot-'.length)));
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
  for (const s of roomSpots) {
    if (own.has(s.id)) continue;
    for (let i = 0; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const z = a.z + ((b.z - a.z) * i) / steps;
      if (Math.abs(x - s.x) < 1.2 && Math.abs(z - s.z) < 2) {
        roomCrossings++;
        break;
      }
    }
  }
}
console.log('Aristas de sala que cruzan una plaza ajena:', roomCrossings);
console.log('Tiendas:', STORES.length, 'por provincia:', Object.entries(STORES.reduce<Record<string, number>>((a, s) => { a[s.province] = (a[s.province] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k}=${v}`).join(', '));