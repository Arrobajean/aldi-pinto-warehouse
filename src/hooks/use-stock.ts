'use client';

import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import type { WarehouseScene, StockSelection } from '@/three/warehouse-scene';
import { STOCK_MODES, type StockColorMode } from '@/lib/stock/colors';
import { articleForSku } from '@/lib/stock/catalog';
import type { SimState } from '@/lib/sim/types';

export interface StockAlert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  ts: number;
}

const LOC_RE = /^(S|F|C|V|X|B)-\d{2}-\d{2}-\d-[A-C]$/i;

export function useStock(sceneRef: MutableRefObject<WarehouseScene | null>, simState: SimState | null) {
  const [mode, setMode] = useState<StockColorMode>('occupancy');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<StockSelection | null>(null);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);

  useEffect(() => {
    sceneRef.current?.setStockColorMode(mode);
  }, [mode, sceneRef]);

  // Alertas de stock periódicas (caducidad, mínimos de picking y saturación).
  useEffect(() => {
    if (!simState) return;
    const evalAlerts = () => {
      const out: StockAlert[] = [];
      const scene = sceneRef.current;
      const s = simState;

      // Caducidad próxima: palets en rack con < 8 días.
      let expiring = 0;
      for (const paletId of Object.values(s.rackOccupancy)) {
        const p = s.paletById[paletId];
        if (p && p.daysToExpiry <= 8) expiring++;
      }
      if (expiring > 0) {
        out.push({ id: `exp-${s.ts}`, severity: 'critical', message: `${expiring} palets con caducidad ≤ 8 días (FEFO)`, ts: s.ts });
      }

      // Picking bajo mínimo por categoría.
      for (const temp of ['dry', 'cool', 'frozen'] as const) {
        if (s.pickingByTemp[temp].length < 4) {
          out.push({ id: `min-${temp}-${s.ts}`, severity: 'warning', message: `Picking de ${temp} bajo mínimo (${s.pickingByTemp[temp].length}) → reposición`, ts: s.ts });
        }
      }

      // Saturación de zona (cada 60 s).
      if (Math.floor(s.ts / 60) !== Math.floor((s.ts - 1) / 60)) {
        void scene;
      }
      setAlerts(out.slice(0, 8));
    };
    evalAlerts();
    const id = setInterval(evalAlerts, 5000);
    return () => clearInterval(id);
  }, [simState, sceneRef]);


  const search = () => {
    const q = query.trim().toUpperCase();
    const scene = sceneRef.current;
    if (!scene || q.length === 0) return;
    if (LOC_RE.test(q)) {
      const sel = scene.stockSelection(q);
      if (sel) {
        scene.focusLocation(q, true);
        setSelection(sel);
      }
      return;
    }
    if (q.startsWith('SKU-')) {
      const locs = scene.getSkuLocations(q);
      if (locs.length > 0) {
        scene.focusLocation(locs[0].locId, true);
        setSelection(scene.stockSelection(locs[0].locId));
      }
      return;
    }
    // Búsqueda por nombre de artículo (familia).
    const sku = getArticlesMatching(q)[0];
    if (sku) {
      const locs = scene.getSkuLocations(sku);
      if (locs.length > 0) {
        scene.focusLocation(locs[0].locId, true);
        setSelection(scene.stockSelection(locs[0].locId));
      }
    }
  };

  const modeLabel = useMemo(() => STOCK_MODES.find((m) => m.id === mode)?.label ?? mode, [mode]);

  return { mode, setMode, query, setQuery, selection, setSelection, alerts, search, modeLabel };
}

/** Artículos cuyo nombre coincide (muestreo determinista del catálogo). */
function getArticlesMatching(q: string): string[] {
  const needles = q.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
  const out: string[] = [];
  for (let i = 0; i < 1800 && out.length < 3; i++) {
    const article = articleForSku(`SKU-${1000 + i}`);
    const hay = `${article.name} ${article.family}`.toLowerCase();
    if (needles.every((n) => hay.includes(n))) out.push(article.sku);
  }
  return out;
}
