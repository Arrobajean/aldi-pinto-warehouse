import type { Graph, GraphNode } from '@/lib/layout/types';
import type { Point } from '@/lib/sim/types';

interface WrappedNode {
  id: string;
  g: number;
  f: number;
  prev: string | null;
}

/** Índice de búsqueda reutilizable para un grafo estable. */
export class PathFinder {
  private nodes = new Map<string, GraphNode>();
  private adj = new Map<string, { to: string; cost: number }[]>();
  private cache = new Map<string, string[]>();

  constructor(graph: Graph) {
    for (const n of graph.nodes) this.nodes.set(n.id, n);
    for (const n of graph.nodes) this.adj.set(n.id, []);
    for (const e of graph.edges) {
      const from = this.nodes.get(e.from);
      const to = this.nodes.get(e.to);
      if (!from || !to) continue;
      const cost = e.cost ?? Math.hypot(to.x - from.x, to.z - from.z);
      this.adj.get(e.from)!.push({ to: e.to, cost });
      // Aristas bidireccionales.
      if (!this.adj.get(e.to)) this.adj.set(e.to, []);
      this.adj.get(e.to)!.push({ to: e.from, cost });
    }
  }

  nearestTo(point: Point): string {
    let best = '';
    let bestD = Infinity;
    for (const n of this.nodes.values()) {
      const d = (n.x - point.x) ** 2 + (n.z - point.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  pointsFor(ids: string[]): Point[] {
    const pts: Point[] = [];
    for (const id of ids) {
      const n = this.nodes.get(id);
      if (n) pts.push({ x: n.x, z: n.z });
    }
    return pts;
  }

  nodePoint(id: string): Point | null {
    const n = this.nodes.get(id);
    return n ? { x: n.x, z: n.z } : null;
  }

  /** Ruta de nodos desde un punto (se aproxima al nodo más cercano) hasta otro nodo. */
  find(from: Point, toId: string): string[] {
    const fromId = this.nearestTo(from);
    return this.search(fromId, toId);
  }

  /** Ruta entre dos nodos, con caché. */
  search(fromId: string, toId: string): string[] {
    if (fromId === toId) return [];
    const key = `${fromId}|${toId}`;
    const hit = this.cache.get(key);
    if (hit) return [...hit];

    const open = new Map<string, WrappedNode>();
    const closed = new Set<string>();
    const startNode = this.nodes.get(fromId);
    const goalNode = this.nodes.get(toId);
    if (!startNode || !goalNode) return [];

    const start: WrappedNode = { id: fromId, g: 0, f: 0, prev: null };
    open.set(fromId, start);

    let result: string[] = [];
    while (open.size > 0) {
      let current: WrappedNode | null = null;
      let best = Infinity;
      for (const w of open.values()) {
        if (w.f < best) {
          best = w.f;
          current = w;
        }
      }
      if (!current) break;
      if (current.id === toId) {
        const path: string[] = [];
        let cur: WrappedNode | null = current;
        while (cur && cur.prev !== null) {
          path.unshift(cur.id);
          cur = open.get(cur.prev) ?? null;
        }
        result = path;
        break;
      }
      open.delete(current.id);
      closed.add(current.id);

      for (const edge of this.adj.get(current.id) ?? []) {
        if (closed.has(edge.to)) continue;
        const tn = this.nodes.get(edge.to)!;
        const g = current.g + edge.cost;
        const h = Math.hypot(tn.x - goalNode.x, tn.z - goalNode.z);
        const existing = open.get(edge.to);
        if (!existing || g < existing.g) {
          open.set(edge.to, { id: edge.to, g, f: g + h, prev: current.id });
        }
      }
    }

    if (result.length) this.cache.set(key, result);
    return result;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }
}