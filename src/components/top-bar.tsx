'use client';

import { formatClock, useNow } from '@/hooks/use-now';

export interface TopBarIndicator {
  label: string;
  value: string;
}

interface TopBarProps {
  indicators: TopBarIndicator[];
}

export function TopBar({ indicators }: TopBarProps) {
  const now = useNow();

  return (
    <header className="flex z-40 h-14 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
        <div className="leading-tight">
          <div className="text-sm font-extrabold tracking-wide text-fg">ALDI</div>
          <div className="text-xs font-medium text-muted">Plataforma Logística Pinto</div>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        {indicators.map((ind) => (
          <div key={ind.label} className="flex min-w-[74px] flex-col gap-0.5 rounded-card border border-line bg-panel-strong px-2.5 py-1">
            <span className="font-mono text-[13px] text-fg">{ind.value}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted">{ind.label}</span>
          </div>
        ))}
      </div>

      <div className="border-l border-line pl-4 font-mono text-sm text-accent" data-testid="sim-clock">{now !== null ? formatClock(new Date(now)) : '--:--:--'}</div>
    </header>
  );
}