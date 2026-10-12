'use client';

import { Truck } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';

interface DockListProps {
  state: SimState;
}

export function DockList({ state }: DockListProps) {
  const active = state.dockStates.filter((d) => d.truckId !== null);
  const activeCount = active.length;

  return (
    <div className="pointer-events-auto absolute right-3 top-[52px] z-30 hidden w-64 flex-col rounded-card border border-line bg-panel/90 shadow-card backdrop-blur lg:flex">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted">
        <Truck size={13} className="text-accent" />
        Muelles activos · {activeCount}/{state.dockStates.length}
      </div>
      <div className="max-h-[240px] overflow-y-auto p-1.5">
        {activeCount === 0 && <p className="px-2 py-3 text-xs text-muted">Sin camiones atracados</p>}
        {active.map((d) => {
          const truck = state.trucks.find((t) => t.id === d.truckId);
          const pct = d.totalPalets > 0 ? Math.round((d.paletsProcessed / d.totalPalets) * 100) : 0;
          return (
            <div key={d.dockId} className="mb-1 rounded-lg bg-panel-strong px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-fg">{d.dockId}</span>
                <span className={`text-[10px] uppercase ${d.state === 'loading' ? 'text-orange' : 'text-accent'}`}>
                  {d.state}
                </span>
              </div>
              <div className="truncate font-mono text-[10px] text-muted">{truck ? truck.plate : '—'}</div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
                <div className="h-full bg-ok" style={{ width: `${pct || 12}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}