'use client';

import type { EntityHit } from '@/hooks/use-rtls';
import type { SimState } from '@/lib/sim/types';

interface EntityLabelProps {
  hover: EntityHit;
  state: SimState;
  following: boolean;
}

/** Etiqueta flotante sobre una máquina/camión. El padre posiciona el div. */
export function EntityLabel({ hover, state, following }: EntityLabelProps) {
  const m = hover.kind === 'machine' ? state.machines.find((x) => x.id === hover.id) : null;
  const t = hover.kind === 'truck' ? state.trucks.find((x) => x.id === hover.id) : null;
  if (!m && !t) return null;

  const operator = m ? m.operatorName : t?.plate ?? '';
  const battery = m ? ` · ⚡ ${m.battery.toFixed(0)}%` : '';
  const typeLabel = m ? (m.kind === 'retractil' ? 'Retráctil' : m.kind === 'frontal' ? 'Frontal' : 'Picker') : 'Camión';

  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-accent/60 bg-panel/95 px-2.5 py-1.5 shadow-card backdrop-blur">
      <span className={`h-2 w-2 flex-none rounded-full ${following ? 'bg-orange' : m ? 'bg-accent' : 'bg-ok'}`} />
      <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-fg">{hover.id}</span>
      <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted">{typeLabel}</span>
      <span className="truncate font-mono text-[10px] text-muted">
        {operator}
        {battery}
      </span>
    </div>
  );
}