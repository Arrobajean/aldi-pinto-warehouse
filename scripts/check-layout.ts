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
console.log('Tiendas:', STORES.length, 'por provincia:', Object.entries(STORES.reduce<Record<string, number>>((a, s) => { a[s.province] = (a[s.province] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k}=${v}`).join(', '));