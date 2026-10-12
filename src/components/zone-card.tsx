'use client';

import { X } from 'lucide-react';
import type { ZoneSummary } from '@/hooks/use-warehouse-scene';

interface ZoneCardProps {
  zone: ZoneSummary;
  onClose: () => void;
}

export function ZoneCard({ zone, onClose }: ZoneCardProps) {
  return (
    <aside className="absolute right-3 top-3 z-30 w-72 max-w-[calc(100vw-24px)] rounded-card border border-line bg-panel/95 p-3.5 shadow-card backdrop-blur">
      <header className="mb-2.5 flex items-center gap-2.5">
        <span className="h-3.5 w-3.5 flex-none rounded-[4px]" style={{ background: zone.color }} />
        <h2 className="flex-1 text-[15px] font-bold text-fg">{zone.label}</h2>
        <button className="p-0.5 text-muted transition-colors hover:text-fg" onClick={onClose} title="Cerrar">
          <X size={16} />
        </button>
      </header>

      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Superficie</dt>
          <dd className="text-right text-[13px] font-semibold text-fg">{zone.surface.toLocaleString('es-ES')} m²</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Temperatura</dt>
          <dd className="text-right text-[13px] font-semibold text-fg">{zone.temp}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Ubicaciones</dt>
          <dd className="text-right text-[13px] font-semibold text-fg">{zone.locations.toLocaleString('es-ES')}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Ocupación</dt>
          <dd className="text-right text-[13px] font-semibold text-fg">~{zone.occupancy.toLocaleString('es-ES')} palets</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-muted">Pasillos</dt>
          <dd className="text-right text-[13px] font-semibold text-fg">{zone.aisles}</dd>
        </div>
      </dl>

      {zone.storage === 'floor' && (
        <p className="mt-2.5 border-t border-line pt-2 text-[10px] text-muted">
          Almacenaje en el suelo (calles de palets), sin estanterías.
        </p>
      )}
    </aside>
  );
}