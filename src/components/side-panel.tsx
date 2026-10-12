'use client';

import { Layers, Map as MapIcon } from 'lucide-react';
import type { ZoneSummary } from '@/hooks/use-warehouse-scene';
import type { SceneLayerId } from '@/three/warehouse-scene';

interface SidePanelProps {
  zones: ZoneSummary[];
  layerLabels: { id: SceneLayerId; label: string }[];
  layers: Record<SceneLayerId, boolean>;
  onFocusZone: (zoneId: ZoneSummary['id']) => void;
  onToggleLayer: (id: SceneLayerId) => void;
}

export function SidePanel({ zones, layerLabels, layers, onFocusZone, onToggleLayer }: SidePanelProps) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 bottom-3 z-30 flex w-64 max-w-[70vw] flex-col gap-3">
      <section className="pointer-events-auto rounded-card border border-line bg-panel/90 p-3 shadow-card backdrop-blur">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
          <MapIcon size={13} /> Zonas
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {zones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => onFocusZone(zone.id)}
              className="flex items-center gap-2 rounded-lg border border-line bg-panel-strong px-2.5 py-2 text-left text-xs text-fg transition-colors hover:border-accent"
              title={`${zone.label} · ${zone.surface.toLocaleString('es-ES')} m²`}
            >
              <span className="h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: zone.color }} />
              <span className="truncate">{zone.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pointer-events-auto rounded-card border border-line bg-panel/90 p-3 shadow-card backdrop-blur">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
          <Layers size={13} /> Capas
        </h3>
        <div className="flex flex-col gap-0.5">
          {layerLabels.map((layer) => (
            <label key={layer.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px] text-fg hover:bg-panel-strong">
              <span>{layer.label}</span>
              <span className="ml-auto flex h-[17px] w-[30px] flex-none items-center rounded-full bg-line p-0.5 transition-colors" data-checked={layers[layer.id]}>
                <input
                  type="checkbox"
                  checked={layers[layer.id]}
                  onChange={() => onToggleLayer(layer.id)}
                  className="sr-only"
                />
                <span
                  className={`h-[13px] w-[13px] rounded-full bg-muted transition-transform ${layers[layer.id] ? 'translate-x-[13px] !bg-accent' : ''}`}
                />
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}