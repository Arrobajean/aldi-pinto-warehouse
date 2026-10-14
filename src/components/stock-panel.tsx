'use client';

import { memo } from 'react';
import { Search, X, Package2 } from 'lucide-react';
import { STOCK_MODES, type StockColorMode } from '@/lib/stock/colors';
import { articleForSku, aisleCategoryLabel } from '@/lib/stock/catalog';
import type { StockSelection } from '@/three/warehouse-scene';
import type { StockAlert } from '@/hooks/use-stock';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
  rotation: 'bg-primary',
  fefo: 'bg-success',
  empty: 'bg-warning',
};

export const StockPanel = memo(function StockPanel({ mode, onMode, query, onQuery, onSearch, selection, onCloseSelection, alerts }: StockPanelProps) {
  return (
    <Card className="pointer-events-auto absolute left-1/2 top-3 z-30 w-[36rem] max-w-[calc(100vw-24px)] -translate-x-1/2 gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur">
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          <Package2 className="size-4 text-success" />
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">Stock · ubicaciones</h3>
          <form
            className="ml-auto flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              onSearch();
            }}
          >
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Pasillo (S-01, F-03), ubicación (S-07-12-3-B) o producto…"
              aria-label="Buscar pasillo, ubicación o producto"
              className="h-8 font-mono text-xs"
            />
            <Button type="submit" size="icon" variant="outline" className="size-8" aria-label="Ejecutar búsqueda">
              <Search />
            </Button>
          </form>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {STOCK_MODES.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={mode === m.id ? 'default' : 'outline'}
              onClick={() => onMode(m.id)}
              className="h-7 gap-1.5 px-2.5 text-[11px] font-normal"
            >
              <span className={cn('size-2 rounded-full', MODE_STYLE[m.id])} />
              {m.label}
            </Button>
          ))}
        </div>

        {alerts.length > 0 && (
          <ul className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'flex items-start gap-1.5 text-[11px] leading-snug',
                  a.severity === 'critical' ? 'text-destructive' : 'text-warning',
                )}
              >
                <span className={cn('mt-1 size-1.5 flex-none rounded-full', a.severity === 'critical' ? 'bg-destructive' : 'bg-warning')} />
                {a.message}
              </li>
            ))}
          </ul>
        )}

        {selection && (
          <div className="mt-2.5 border-t border-border pt-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">{selection.locId}</span>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {selection.empty ? 'vacío' : selection.sku}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-6 text-muted-foreground"
                onClick={onCloseSelection}
                aria-label="Cerrar detalle de ubicación"
              >
                <X />
              </Button>
            </div>
            {selection.empty ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Ubicación vacía, lista para recibir.</p>
            ) : selection.sku ? (
              <LocationDetail selection={selection} />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

function LocationDetail({ selection }: { selection: StockSelection }) {
  const sku = selection.sku;
  if (!sku) return null;
  const article = articleForSku(sku);
  const batch = `L${String(24000 + (Number(sku.replace(/\D+/g, '')) % 900)).padStart(5, '0')}`;
  const quantity = 40 + (Number(sku.replace(/\D+/g, '')) % 60);

  const aisleId = selection.locId ? selection.locId.split('-').slice(0, 2).join('-') : '';
  const aisleCategory = aisleId ? aisleCategoryLabel(aisleId) : '';

  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
      <Detail k="Artículo" v={article.name} />
      <Detail k="Marca" v={article.brand} />
      <Detail k="Pasillo" v={aisleId ? `${aisleId} · ${aisleCategory}` : '—'} />
      <Detail k="Familia" v={article.family} />
      <Detail k="Cat. Comercial" v={article.commercialCategory} />
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
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn('text-right font-semibold text-foreground', mono && 'font-mono')}>{v}</dd>
    </div>
  );
}
