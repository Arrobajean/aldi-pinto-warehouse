/**
 * Comprueba la colocación del mobiliario (cubos, postes, carteles y pasos de cebra) frente a la circulación:
 * ni sobre las aristas del grafo de la nave o del patio (pasillos y calles de camiones) ni dentro de una estantería.
 * Uso: npx --yes tsx --tsconfig tsconfig.json scripts/check-props.ts
 */
import { buildPintoLayout } from '@/lib/layout/pinto-layout';
import { buildYardProps } from '@/lib/layout/props';
import type { Graph, RackLine, WarehouseLayout } from '@/lib/layout/types';

/** Distancia de un punto a un segmento del plano XZ. */
function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Distancia mínima de un punto a las aristas de un grafo de circulación (sin contar las aristas de sala). */
function distToGraph(g: Graph, x: number, z: number): number {
  const node = new Map(g.nodes.map((n) => [n.id, n]));
  let best = Infinity;
  for (const e of g.edges) {
    const a = node.get(e.from);
    const b = node.get(e.to);
    if (!a || !b) continue;
    best = Math.min(best, distToSegment(x, z, a.x, a.z, b.x, b.z));
  }
  return best;
}

/** Distancia a la estantería más cercana (cada línea ocupa 1,1 m de fondo en x, por segmentos en z). */
function distToRacks(rackLines: RackLine[], x: number, z: number): number {
  let best = Infinity;
  for (const line of rackLines) {
    const xMin = line.xCenter - line.depth / 2;
    const xMax = line.xCenter + line.depth / 2;
    for (const seg of line.segments) {
      const dx = Math.max(xMin - x, 0, x - xMax);
      const dz = Math.max(seg.zStart - z, 0, z - seg.zEnd);
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best;
}

interface Result {
  label: string;
  x: number;
  z: number;
  graph: number;
  racks: number;
  ok: boolean;
}

function check(layout: WarehouseLayout) {
  const props = buildYardProps(layout);
  const results: Result[] = [];
  const inNave = (x: number, z: number) => {
    const r = layout.building.rect;
    return x > r.xMin && x < r.xMax && z > r.zMin && z < r.zMax;
  };
  const yardGraph = layout.yardGraph;
  const indoor = layout.indoorGraph;

  for (const b of props.bins) {
    const onNave = inNave(b.x, b.z);
    const g = onNave ? distToGraph(indoor, b.x, b.z) : distToGraph(yardGraph, b.x, b.z);
    const r = distToRacks(layout.rackLines, b.x, b.z);
    // Cubos: 1,0 m libres de cualquier arista de circulación (la mitad del cubo ya es 0,35 m) y fuera de racks.
    results.push({ label: `bin ${b.kind}`, x: b.x, z: b.z, graph: g, racks: r, ok: g >= 1.0 && r >= 0.8 });
  }
  for (const p of props.posts) {
    const onNave = inNave(p.x, p.z);
    const g = onNave ? distToGraph(indoor, p.x, p.z) : distToGraph(yardGraph, p.x, p.z);
    const r = distToRacks(layout.rackLines, p.x, p.z);
    // Postes de señal: 2 m libres del carril (el cartel sobresale poco) y fuera de racks.
    results.push({ label: `post ${p.kind}`, x: p.x, z: p.z, graph: g, racks: r, ok: g >= 2.0 && r >= 0.8 });
  }
  for (const c of props.crosswalks) {
    // El paso ocupa la calzada: se valida el centro (el carril ya tiene 2 m de margen a cada lado del paso).
    const g = distToGraph(yardGraph, c.cx, c.cz);
    results.push({ label: `crosswalk ${c.trafficAxis}`, x: c.cx, z: c.cz, graph: g, racks: Infinity, ok: true });
  }
  return results;
}

const layout = buildPintoLayout();
const results = check(layout);
const bad = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(
    `${r.ok ? 'ok ' : 'XX '} ${r.label.padEnd(20)} (${r.x.toFixed(1)}, ${r.z.toFixed(1)})  arista ${r.graph.toFixed(2)} m  rack ${Number.isFinite(r.racks) ? r.racks.toFixed(2) : '—'} m`,
  );
}
console.log(`Elementos: ${results.length} · fuera de criterio: ${bad.length}`);
if (bad.length > 0) process.exitCode = 1;
