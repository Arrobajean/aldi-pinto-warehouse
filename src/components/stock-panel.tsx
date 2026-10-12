'use client';

import { Search, X, Package2 } from 'lucide-react';
import { STOCK_MODES, type StockColorMode } from '@/lib/stock/colors';
import { articleForSku } from '@/lib/stock/catalog';
import type { StockSelection } from '@/three/warehouse-scene';
import type { StockAlert } from '@/hooks/use-stock';

interface StockPanelProps {
  mode: StockColorMode;
  onMode: (m: StockColorMode) => void;
  query: string;
  onQuery: (q: string) => void;
  onSearch: () => void;
  selection: StockSelection | null;
  onCloseSelection: () => void;
  alerts: StockAlert[];
}

const MODE_STYLE: Record<StockColorMode, string> = {
  occupancy: 'bg-zone-seco',
  family: 'bg-orange',
  rotation: 'bg-accent',
  fefo: 'bg-ok',
  empty: 'bg-warn',
};

export function StockPanel({ mode, onMode, query, onQuery, onSearch, selection, onCloseSelection, alerts }: StockPanelProps) {
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-30 w-[36rem] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-card border border-line bg-panel/95 p-3 shadow-card backdrop-blur">
      <div className="flex items-center gap-2">
        <Package2 size={15} className="text-ok" />
        <h3 className="text-[11px] uppercase tracking-wider text-muted">Stock · ubicaciones</h3>
        <form
          className="ml-auto flex flex-1 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
        >
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Ubicación (S-07-12-3-B) o artículo…"
            className="h-8 w-full rounded-lg border border-line bg-panel-strong px-2.5 font-mono text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button type="submit" className="flex h-8 w-9 items-center justify-center rounded-lg border border-line bg-panel-strong text-fg hover:border-accent">
            <Search size={14} />
          </button>
        </form>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {STOCK_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onMode(m.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
              mode === m.id ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${MODE_STYLE[m.id]}`} />
            {m.label}
          </button>
        ))}
      </div>

      {alerts.length > 0 && (
        <ul className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2">
          {alerts.map((a) => (
            <li key={a.id} className={`flex items-start gap-1.5 text-[11px] leading-snug ${a.severity === 'critical' ? 'text-alert' : 'text-warn'}`}>
              <span className={`mt-1 h-1.5 w-1.5 flex-none rounded-full ${a.severity === 'critical' ? 'bg-alert' : 'bg-warn'}`} />
              {a.message}
            </li>
          ))}
        </ul>
      )}

      {selection && (
        <div className="mt-2.5 border-t border-line pt-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-fg">{selection.locId}</span>
            <span className="rounded-md bg-panel-strong px-1.5 py-0.5 font-mono text-[10px] text-muted">{selection.empty ? 'vacío' : `${selection.sku}`}</span>
            <button className="ml-auto p-0.5 text-muted hover:text-fg" onClick={onCloseSelection}>
              <X size={14} />
            </button>
          </div>
          {selection.empty ? (
            <p className="mt-1.5 text-xs text-muted">Ubicación vacía, lista para recibir.</p>
          ) : selection.sku ? (
            <LocationDetail selection={selection} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function LocationDetail({ selection }: { selection: StockSelection }) {
  const sku = selection.sku;
  if (!sku) return null;
  const article = articleForSku(sku);
  const batch = `L${String(24000 + (Number(sku.replace(/\D+/g, '')) % 900)).padStart(5, '0')}`;
  const quantity = 40 + (Number(sku.replace(/\D+/g, '')) % 60);

  return (
    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      <Detail k="Artículo" v={article.name} />
      <Detail k="Familia" v={article.family} />
      <Detail k="Temperatura" v={article.temp} />
      <Detail k="Rotación" v={article.rotation === 'A' ? 'A (alta)' : article.rotation === 'B' ? 'B (media)' : 'C (baja)'} />
      <Detail k="Lote" v={batch} mono />
      <Detail k="Cantidad" v={`${quantity} uds.`} />
      <Detail k="Caducidad (FEFO)" v={selection.expiryDays !== undefined ? `${selection.expiryDays} días` : '—'} />
      <Detail k="Ubicación" v={selection.locId} mono />
    </dl>
  );
}

function Detail({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right font-semibold text-fg ${mono ? 'font-mono' : ''}`}>{v}</dd>
    </div>
  );
}