'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
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

  const simStateRef = useRef(simState);
  useEffect(() => {
    simStateRef.current = simState;
  }, [simState]);

  // Alertas de stock periódicas (caducidad, mínimos de picking y saturación).
  useEffect(() => {
    const evalAlerts = () => {
      const s = simStateRef.current;
      if (!s) return;
      const out: StockAlert[] = [];

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
        const list = s.pickingByTemp[temp];
        if (list && list.length < 4) {
          out.push({ id: `min-${temp}-${s.ts}`, severity: 'warning', message: `Picking de ${temp} bajo mínimo (${list.length}) → reposición`, ts: s.ts });
        }
      }

      setAlerts(out.slice(0, 8));
    };

    evalAlerts();
    const id = setInterval(evalAlerts, 5000);
    return () => clearInterval(id);
  }, []);


  const search = useCallback(() => {
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
    const AISLE_RE = /^(S|F|C)-\d{2}$/i;
    if (AISLE_RE.test(q)) {
      if (scene.focusAisle(q)) {
        return;
      }
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
  }, [query, sceneRef]);

  const modeLabel = useMemo(() => STOCK_MODES.find((m) => m.id === mode)?.label ?? mode, [mode]);

  return { mode, setMode, query, setQuery, selection, setSelection, alerts, search, modeLabel };
}

/** Artículos cuyo nombre coincide (muestreo determinista del catálogo). */
function getArticlesMatching(q: string): string[] {
  const needles = q.toLowerCase().split(/\s+/).filter((x) => x.length > 2);
  const out: string[] = [];
  for (let i = 0; i < 1800 && out.length < 3; i++) {
    const article = articleForSku(`SKU-${1000 + i}`);
    const hay = `${article.name} ${article.brand} ${article.commercialCategory} ${article.family}`.toLowerCase();
    if (needles.every((n) => hay.includes(n))) out.push(article.sku);
  }
  return out;
}
