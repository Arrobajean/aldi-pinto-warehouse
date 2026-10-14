import { ANNEX_ROOM_ID, LEVEL_HEIGHT, RACK_LEVELS, ROOM_ENTRANCE_Z, STREET_WIDTH, buildPartitions, buildPintoLayout, crossesPartition, forEachRackSlot, partitionCrossings, rackRects, segmentClear } from '../src/lib/layout/pinto-layout';
import { rectArea } from '../src/lib/layout/types';
import { STORES } from '../src/lib/data/stores';
import { FACE_V, dockApproach } from '../src/lib/layout/dock-geometry';
import { yardLanes } from '../src/lib/sim/yard-routes';
import { CELL, buildNavGrid, nearestCell } from '../src/lib/sim/navgrid';
import { NAVE_FLOOR_H } from '../src/three/builders/build-building';

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
console.log('Muelles mixtos:', layout.docks.filter((d) => d.kind === 'mixed').map((d) => d.id).join(' '));
const rackTop = RACK_LEVELS * LEVEL_HEIGHT;
console.log('Altura de rack:', rackTop.toFixed(1), 'm de', layout.building.freeHeight, 'm libres', rackTop < layout.building.freeHeight ? '· ok' : '· REVISAR');
if (rackTop >= layout.building.freeHeight) process.exitCode = 1;
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

// Aseos: ninguna arista del grafo cruza un módulo (con 0,5 m de margen) y ninguno solapa carriles, flejadoras ni salas.
const overlaps = (a: { xMin: number; xMax: number; zMin: number; zMax: number }, b: { xMin: number; xMax: number; zMin: number; zMax: number }) =>
  a.xMin < b.xMax && b.xMin < a.xMax && a.zMin < b.zMax && b.zMin < a.zMax;
const obstacles = [...layout.docks.map((d) => d.laneRect), ...layout.strappers.map((s) => s.rect), ...layout.rooms.map((r) => r.rect)];
let restroomCuts = 0;
let restroomOverlaps = 0;
for (const wc of layout.restrooms) {
  const box = { xMin: wc.rect.xMin - 0.5, xMax: wc.rect.xMax + 0.5, zMin: wc.rect.zMin - 0.5, zMax: wc.rect.zMax + 0.5 };
  restroomOverlaps += obstacles.filter((o) => overlaps(wc.rect, o)).length;
  for (const e of layout.indoorGraph.edges) {
    const a = nodePos.get(e.from);
    const b = nodePos.get(e.to);
    if (!a || !b) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const z = a.z + ((b.z - a.z) * i) / steps;
      if (x > box.xMin && x < box.xMax && z > box.zMin && z < box.zMax) {
        restroomCuts++;
        break;
      }
    }
  }
}
console.log('Aseos:', layout.restrooms.length, '· aristas que cortan un aseo:', restroomCuts, '· solapes con carriles/flejadoras/salas:', restroomOverlaps);
console.log('Tiendas:', STORES.length, 'por provincia:', Object.entries(STORES.reduce<Record<string, number>>((a, s) => { a[s.province] = (a[s.province] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k}=${v}`).join(', '));
// Maniobra de atraque: mismas reglas que la animación anterior de la escena (calle a 25 m de la fachada, radio 12,5,
// parada a 37,5 m y atraque a 14,1 m), referidas a la fachada de cada cara.
let approachMismatch = 0;
for (const d of layout.docks) {
  const a = dockApproach(d);
  const u = d.face === 'south' ? d.x : d.z;
  const exp =
    d.face === 'south'
      ? { start: [u + 12.5, 105], stop: [u, 117.5], target: [u, 94.1], h: Math.PI }
      : { start: [FACE_V.east + 25, u + 12.5], stop: [FACE_V.east + 37.5, u], target: [FACE_V.east + 14.1, u], h: -Math.PI / 2 };
  const near = (p: { x: number; z: number }, q: number[]) => Math.abs(p.x - q[0]) < 1e-9 && Math.abs(p.z - q[1]) < 1e-9;
  if (!near(a.start, exp.start) || !near(a.stop, exp.stop) || !near(a.target, exp.target) || Math.abs(Math.sin(a.alignHeading - exp.h)) + Math.abs(1 - Math.cos(a.alignHeading - exp.h)) > 1e-9) approachMismatch++;
}
console.log('Maniobras de atraque distintas de las de la escena anterior:', approachMismatch);

// Carriles del patio: ningún punto dentro de la nave ni en el aparcamiento de semirremolques.
const nave = layout.building.rect;
let laneInside = 0;
for (const lane of yardLanes(layout.docks, layout.site.truckParking.stalls)) {
  for (const p of lane) {
    if (p.x > nave.xMin && p.x < nave.xMax && p.z > nave.zMin && p.z < nave.zMax) laneInside++;
  }
}
console.log('Puntos de carril del patio dentro de la nave:', laneInside);

// Códigos de ubicación: únicos (los lados A y B de un pasillo no comparten código).
const seenLoc = new Set<string>();
let dupLoc = 0;
forEachRackSlot(layout, (slot) => {
  if (seenLoc.has(slot.locationId)) dupLoc++;
  seenLoc.add(slot.locationId);
});
console.log('Códigos de ubicación duplicados:', dupLoc);

// Flejadoras y playa de consolidación: dentro de la nave, sin solapes, ninguna arista las cruza y sus puntos son alcanzables.
{
  type Box = { xMin: number; xMax: number; zMin: number; zMax: number };
  const rackBoxes = rackRects(layout.rackLines);
  const items: { id: string; rect: Box; points: { name: string; x: number; z: number }[] }[] = [
    ...layout.strappers.map((s) => ({ id: s.id, rect: s.rect, points: [{ name: 'input', ...s.input }, { name: 'output', ...s.output }] })),
    ...layout.consolidation.map((c) => ({ id: c.id, rect: c.rect, points: [{ name: 'dropPoint', ...c.dropPoint }] })),
  ];
  const others: { id: string; rect: Box }[] = [
    ...rackBoxes.map((r, i) => ({ id: `rack#${i}`, rect: r })),
    ...layout.restrooms.map((w) => ({ id: w.id, rect: w.rect })),
    ...layout.rooms.map((r) => ({ id: r.id, rect: r.rect })),
    ...layout.docks.map((d) => ({ id: `lane-${d.id}`, rect: d.laneRect })),
    ...items.map((it) => ({ id: it.id, rect: it.rect })),
  ];
  const allRects = [...rackBoxes, ...items.map((it) => it.rect)];
  let outside = 0;
  let overlapCount = 0;
  let edgeCuts = 0;
  let unreachable = 0;
  for (const it of items) {
    const r = it.rect;
    if (r.xMin < nave.xMin || r.xMax > nave.xMax || r.zMin < nave.zMin || r.zMax > nave.zMax) {
      outside++;
      console.log('  fuera de la nave:', it.id);
    }
    for (const o of others) {
      if (o.id !== it.id && overlaps(r, o.rect)) {
        overlapCount++;
        console.log('  solape:', it.id, '↔', o.id);
      }
    }
    for (const e of layout.indoorGraph.edges) {
      const a = nodePos.get(e.from);
      const b = nodePos.get(e.to);
      if (!a || !b) continue;
      if (!segmentClear(a.x, a.z, b.x, b.z, [r])) {
        edgeCuts++;
        console.log('  arista cruza', it.id, ':', e.from, '→', e.to);
      }
    }
    for (const p of it.points) {
      const inside = allRects.some((q) => p.x > q.xMin && p.x < q.xMax && p.z > q.zMin && p.z < q.zMax);
      const ok = !inside && layout.indoorGraph.nodes.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 3 && segmentClear(p.x, p.z, n.x, n.z, allRects));
      if (!ok) {
        unreachable++;
        console.log('  punto no alcanzable:', it.id, p.name, p.x, p.z);
      }
    }
  }
  console.log(
    `Flejadoras: ${layout.strappers.length} · playas: ${layout.consolidation.length} (${layout.consolidation.map((c) => c.lanes.length).join('/')} calles)`,
    '· fuera de la nave:', outside,
    '· solapes (racks/aseos/salas/carriles):', overlapCount,
    '· aristas que las cruzan:', edgeCuts,
    '· puntos no alcanzables:', unreachable,
  );

  // Conectividad: desde cada entrada/salida/entrega/recogida se llega a todos los muelles por el grafo.
  const adj = new Map<string, string[]>();
  for (const e of layout.indoorGraph.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    if (!e.directed) adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const reach = (start: string) => {
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      for (const n of adj.get(stack.pop()!) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    return seen;
  };
  const pointNodes = [
    ...layout.strappers.flatMap((s) => [`strap-${s.id}-in`, `strap-${s.id}-out`]),
    ...layout.consolidation.map((c) => `cons-${c.id}-drop`),
  ];
  let disconnected = 0;
  for (const id of pointNodes) {
    const seen = reach(id);
    const missing = layout.docks.filter((d) => !seen.has(`dock-${d.id}`)).length + layout.aisles.filter((a) => !seen.has(`aisle-${a.id}-S`)).length;
    if (missing > 0) {
      disconnected++;
      console.log('  desde', id, 'faltan', missing, 'muelles/pasillos');
    }
  }
  console.log('Puntos de flejado/consolidación sin ruta a todos los muelles y pasillos:', disconnected);
}

// Tabiques de cámara: ninguna arista los cruza fuera de un hueco; las que pasan por un hueco van por su centro (±0,5 m);
// todos los huecos miden ≥ 7 m. Anchos útiles de calle norte, transversales, calles interiores y spine ≥ 7 m.
{
  const partitions = buildPartitions();
  let wallCuts = 0;
  let offCenter = 0;
  for (const e of layout.indoorGraph.edges) {
    const a = nodePos.get(e.from);
    const b = nodePos.get(e.to);
    if (!a || !b) continue;
    for (const c of partitionCrossings(a.x, a.z, b.x, b.z, partitions)) {
      if (!c.hole) {
        wallCuts++;
        console.log('  arista cruza tabique', c.id, ':', e.from, '→', e.to);
      } else if (Math.abs(c.u - (c.hole[0] + c.hole[1]) / 2) > 0.5) {
        offCenter++;
        console.log('  arista fuera del centro del hueco', c.id, c.hole, ':', e.from, '→', e.to, c.u.toFixed(2));
      }
    }
  }
  // La puerta de la sala anexa mide 6 m a propósito (se comprueba aparte, en el bloque de la sala anexa).
  const narrowDoors = partitions.filter((p) => !p.id.startsWith('annex')).flatMap((p) => p.holes.filter(([h0, h1]) => h1 - h0 < STREET_WIDTH - 1e-9).map((h) => `${p.id} ${h}`));
  console.log('Aristas que cruzan un tabique:', wallCuts, '· aristas fuera del centro de su hueco:', offCenter, '· huecos < 7 m:', narrowDoors.length, narrowDoors.join(' '));

  // Playas: sin solape con tabiques (con 0,3 m de grosor).
  let playaWall = 0;
  for (const c of layout.consolidation) {
    for (const p of partitions) {
      const box = p.along === 'x' ? { xMin: p.from, xMax: p.to, zMin: p.at - 0.3, zMax: p.at + 0.3 } : { xMin: p.at - 0.3, xMax: p.at + 0.3, zMin: p.from, zMax: p.to };
      if (overlaps(c.rect, box)) playaWall++;
    }
  }
  console.log('Playas que solapan un tabique:', playaWall);

  const narrow: string[] = [];
  for (const ca of layout.crossAisles) if (ca.zMax - ca.zMin < STREET_WIDTH) narrow.push(`transversal ${ca.zMin}…${ca.zMax}`);
  // Calles norte y sur de cada zona de racks: hueco entre su límite (muro, tabique o banda del spine) y los racks.
  const limits: Record<string, { north: number; south: number }> = {
    seco: { north: nave.zMin, south: 50 },
    frio: { north: nave.zMin, south: -25 },
    congelado: { north: -25, south: 43 },
  };
  for (const [zone, lim] of Object.entries(limits)) {
    const lines = layout.rackLines.filter((l) => l.zoneId === zone);
    const head = Math.min(...lines.map((l) => l.segments[0].zStart));
    const tail = Math.max(...lines.map((l) => l.segments[l.segments.length - 1].zEnd));
    console.log(`  ${zone}: calle norte ${(head - lim.north).toFixed(1)} m · calle sur ${(lim.south - tail).toFixed(1)} m`);
    if (head - lim.north < STREET_WIDTH) narrow.push(`${zone} norte`);
    if (lim.south - tail < STREET_WIDTH) narrow.push(`${zone} sur`);
  }
  console.log('Calles con menos de 7 m útiles:', narrow.length, narrow.join(', '));
  const eastDocks = layout.docks.filter((d) => d.face === 'east').map((d) => d.z);
  console.log('Muelles este z:', Math.max(...eastDocks).toFixed(1), '…', Math.min(...eastDocks).toFixed(1), '· pitch', (eastDocks[0] - eastDocks[1]).toFixed(1));
  for (const c of layout.consolidation) {
    console.log(`  ${c.id} [${c.temps.join(',')}] rect x ${c.rect.xMin}…${c.rect.xMax} z ${c.rect.zMin}…${c.rect.zMax} · drop (${c.dropPoint.x}, ${c.dropPoint.z}) · ${c.lanes.length} calles de ${c.lanes[0]?.length} m`);
  }
}

// Sala de máquinas anexa (ampliación de la nave al oeste): plazas, puerta, red propia de doble sentido y muros.
{
  const annex = layout.building.annex;
  const room = layout.rooms.find((r) => r.id === ANNEX_ROOM_ID);
  const mainReposo = layout.rooms.filter((r) => r.kind === 'reposo' && r.id !== ANNEX_ROOM_ID).flatMap((r) => r.spots);
  if (!annex || !room) {
    console.log('Sala anexa: NO DEFINIDA');
    process.exitCode = 1;
  } else {
    const WALL_HALF = 0.2; // medio grosor de los muros (0,4 m)
    const BAY_X = 2.0; // semifondo de la plaza (4,0 m en x)
    const BAY_Z = 1.05; // semiancho de la plaza (2,2 m en z)
    const spots = room.spots;
    const bay = (s: { x: number; z: number }) => ({ xMin: s.x - BAY_X, xMax: s.x + BAY_X, zMin: s.z - BAY_Z, zMax: s.z + BAY_Z });
    const ids = spots.map((s) => s.id);
    const idsOk = ids.every((id, i) => id === `REP-${String(1 + i).padStart(2, '0')}`) && new Set(ids).size === ids.length;
    const totalReposo = layout.rooms.flatMap((r) => r.spots).filter((s) => s.kind === 'reposo').length;

    // La antigua sala de máquinas (x −125…−105, z −85…−14,5) no tiene plazas ni sala: el aparcamiento es solo la anexa.
    const mainVacia = mainReposo.length === 0 && !layout.rooms.some((r) => r.id === 'sala-reposo');
    const carga = layout.rooms.find((r) => r.kind === 'carga')?.spots ?? [];
    console.log(
      'Sala anexa:', spots.length, 'plazas (', ids[0], '…', ids[ids.length - 1], ') · ids correlativos y únicos:', idsOk,
      '· reposo total:', totalReposo, '(esperado', spots.length, ') · antigua sala sin plazas ni sala:', mainVacia, '· 12 cargadores:', carga.length === 12,
    );

    // Plazas: dentro de la anexa sin tocar los muros, sin solapes entre sí ni con los obstáculos, y sin invadir la calle
    // de la puerta (z −36…−32, centrada en el transversal z = −34).
    let wallOverlap = 0;
    let bayOverlap = 0;
    let doorLaneBays = 0;
    for (const s of spots) {
      const b = bay(s);
      if (b.xMin < annex.xMin + WALL_HALF || b.xMax > annex.xMax - WALL_HALF || b.zMin < annex.zMin + WALL_HALF || b.zMax > annex.zMax - WALL_HALF) {
        wallOverlap++;
        console.log('  plaza toca un muro:', s.id);
      }
      if (b.zMax > ROOM_ENTRANCE_Z - 2) doorLaneBays++;
      for (const o of spots) if (o.id > s.id && overlaps(b, bay(o))) bayOverlap++;
    }
    const otherRooms = layout.rooms.filter((r) => r.id !== ANNEX_ROOM_ID).map((r) => r.rect);
    const annexSolapes = [...otherRooms, ...layout.restrooms.map((w) => w.rect), ...layout.strappers.map((s) => s.rect), ...layout.consolidation.map((c) => c.rect), ...rackRects(layout.rackLines)].filter((r) => overlaps(annex, r)).length;
    console.log('  plazas que tocan un muro:', wallOverlap, '· plazas solapadas entre sí:', bayOverlap, '· plazas que invaden la calle de la puerta (z −36…−32):', doorLaneBays, '· solapes de la anexa con salas/aseos/flejadoras/playas/racks:', annexSolapes);

    // Calles: ancho libre entre filas de plazas ≥ 3,6 m (columnas contiguas) y entre la fila y el muro.
    const colXs = [...new Set(spots.map((s) => s.x))].sort((a, b) => a - b);
    const gaps = colXs.slice(1).map((x, i) => x - colXs[i] - 2 * BAY_X);
    console.log('  calles libres entre columnas (m):', gaps.map((g) => g.toFixed(1)).join(', '), '· mínimo', Math.min(...gaps).toFixed(1), gaps.every((g) => g >= 3.6) ? '(≥ 3,6 ok)' : '(MENOR DE 3,6)');

    // Puerta del muro x = −125: 6 m, centrada en el transversal z = −34, y es la única apertura de ese tramo.
    const wall = buildPartitions().find((p) => p.id === 'annex-e');
    const hole = wall?.holes[0];
    console.log(
      '  puerta del muro x =', wall?.at, '· huecos:', wall?.holes.length, '· ancho', hole ? hole[1] - hole[0] : '—', 'm · centro z', hole ? (hole[0] + hole[1]) / 2 : '—',
      '· tramo', wall?.from, '…', wall?.to, '· altura', wall?.height, '(freeHeight', layout.building.freeHeight + ')',
      hole && hole[1] - hole[0] === 6 && (hole[0] + hole[1]) / 2 === ROOM_ENTRANCE_Z && wall?.holes.length === 1 ? '· ok' : '· REVISAR',
    );

    // Red de la anexa: nodos propios (plazas, accesos y cruces `room-annex-cross-*`).
    const annexSpotIds = new Set(spots.map((s) => s.id));
    const isAnnexNode = (id: string) => id.startsWith('room-annex-') || [...annexSpotIds].some((sid) => id === `spot-${sid}` || id === `room-access-${sid}` || id === `room-exit-${sid}`);
    const entrance = `room-cross-1-${ROOM_ENTRANCE_Z}`;
    const annexEdges = layout.indoorGraph.edges.filter((e) => isAnnexNode(e.from) || isAnnexNode(e.to));

    // 1. Alcance: desde la calle de la puerta de la sala principal se llega a todas las plazas y se vuelve (aristas de doble sentido).
    const adj2 = new Map<string, string[]>();
    for (const e of layout.indoorGraph.edges) {
      adj2.set(e.from, [...(adj2.get(e.from) ?? []), e.to]);
      if (!e.directed) adj2.set(e.to, [...(adj2.get(e.to) ?? []), e.from]);
    }
    const reachFrom = (start: string) => {
      const seen = new Set([start]);
      const stack = [start];
      while (stack.length) for (const n of adj2.get(stack.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), stack.push(n));
      return seen;
    };
    const fromEntrance = reachFrom(entrance);
    const unreachable = spots.filter((s) => !fromEntrance.has(`spot-${s.id}`)).length;
    const cannotReturn = spots.filter((s) => !reachFrom(`spot-${s.id}`).has(entrance)).length;
    // Desde el exterior de la sala (aprox.: un muelle) también se llega a las plazas (la anexa no queda aislada).
    const fromDock = reachFrom(`dock-${layout.docks[0].id}`);
    const unreachableFromDock = spots.filter((s) => !fromDock.has(`spot-${s.id}`)).length;
    console.log('  plazas no alcanzables desde', entrance + ':', unreachable, '· sin camino de vuelta:', cannotReturn, '· no alcanzables desde un muelle:', unreachableFromDock);

    // 2. La anexa no entra en el circuito de sentido único de la sala principal.
    const directedTouching = annexEdges.filter((e) => e.directed).length;
    const links = annexEdges.filter((e) => isAnnexNode(e.from) !== isAnnexNode(e.to) && e.from < e.to || (isAnnexNode(e.from) !== isAnnexNode(e.to) && e.directed)); // cada arista bidireccional se guarda dos veces
    const linkDesc = links.map((e) => `${e.from}↔${e.to}`).join(' ');
    const inCircuit = layout.indoorGraph.nodes.filter((n) => {
      return /^room-(exit|access)-REP-\d+$/.test(n.id) && layout.indoorGraph.edges.some((e) => e.directed && (e.from === n.id || e.to === n.id));
    }).length;
    console.log('  aristas de la anexa:', annexEdges.length, '· de sentido único:', directedTouching, '· nodos de la anexa en el circuito de sentido único:', inCircuit, '· enlaces con el resto del grafo:', links.length, '(' + linkDesc + ')');

    // 3. Ninguna arista de la anexa cruza una plaza ajena, un muro exterior ni el muro x = −125 fuera de la puerta.
    const nodeById = new Map(layout.indoorGraph.nodes.map((n) => [n.id, n]));
    const partitionsAll = buildPartitions();
    let cutBay = 0;
    let cutWall = 0;
    let cutPartition = 0;
    for (const e of annexEdges) {
      const a = nodeById.get(e.from);
      const b = nodeById.get(e.to);
      if (!a || !b) continue;
      for (const s of spots) {
        const own = e.from === `spot-${s.id}` || e.to === `spot-${s.id}`;
        // Una arista de plaza llega a su centro: entra en la propia plaza, no en las demás.
        if (!own && !segmentClear(a.x, a.z, b.x, b.z, [bay(s)])) cutBay++;
      }
      // Muros exteriores (oeste, norte, sur): ningún punto del tramo en o fuera de la cara interior de cada uno.
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
      for (let i = 0; i <= steps; i++) {
        const x = a.x + ((b.x - a.x) * i) / steps;
        const z = a.z + ((b.z - a.z) * i) / steps;
        if (x <= annex.xMin + WALL_HALF || z <= annex.zMin + WALL_HALF || z >= annex.zMax - WALL_HALF) {
          cutWall++;
          break;
        }
      }
      if (crossesPartition(a.x, a.z, b.x, b.z, partitionsAll)) cutPartition++;
    }
    console.log('  aristas que cruzan una plaza ajena:', cutBay, '· aristas que tocan un muro exterior de la anexa:', cutWall, '· aristas que cruzan el muro x = −125 fuera de la puerta:', cutPartition);

    // 4. Cada plaza está dentro de `building.annex` y por encima del suelo: la cota de piso de la anexa es la de la nave
    // (NAVE_FLOOR_H > 0, la misma condición que `floorY` de entity-sync) y la retícula de navegación tiene celda junto a la plaza.
    const grid = buildNavGrid(layout);
    let outsideAnnex = 0;
    let belowFloor = 0;
    let noNavCell = 0;
    for (const s of spots) {
      const inAnnex = s.x > annex.xMin && s.x < annex.xMax && s.z > annex.zMin && s.z < annex.zMax;
      if (!inAnnex) {
        outsideAnnex++;
        console.log('  plaza fuera de la anexa:', s.id, s.x, s.z);
      }
      const floorY = inAnnex ? NAVE_FLOOR_H : 0;
      if (!(floorY > 0)) belowFloor++;
      const cell = nearestCell(grid, s);
      if (cell < 0 || Math.hypot(grid.x[cell] - s.x, grid.z[cell] - s.z) > CELL * 1.5) {
        noNavCell++;
        console.log('  plaza sin celda de navegación cercana:', s.id);
      }
    }
    console.log('  plazas fuera de la anexa:', outsideAnnex, '· plazas sin suelo (cota de piso 0):', belowFloor, '· plazas sin celda de navegación:', noNavCell, '· cota de piso de la anexa:', NAVE_FLOOR_H, 'm');
    if (outsideAnnex || belowFloor || noNavCell) process.exitCode = 1;

    if (!idsOk || !mainVacia || totalReposo !== spots.length || carga.length !== 12 || wallOverlap || bayOverlap || doorLaneBays || annexSolapes || unreachable || cannotReturn || unreachableFromDock || directedTouching || inCircuit || cutBay || cutWall || cutPartition || links.length !== 1 || Math.min(...gaps) < 3.6) {
      console.log('  SALA ANEXA: HAY COMPROBACIONES FALLIDAS');
      process.exitCode = 1;
    } else {
      console.log('  SALA ANEXA: todas las comprobaciones ok');
    }
  }
}
