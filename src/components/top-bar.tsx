'use client';

import { memo } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface TopBarIndicator {
  label: string;
  value: string;
}

interface TopBarProps {
  indicators: TopBarIndicator[];
  className?: string;
}

export const TopBar = memo(function TopBar({ indicators, className }: TopBarProps) {
  return (
    <div className={cn('pointer-events-auto flex items-center gap-2', className)}>
      {indicators.map((ind, i) => (
        <Card
          key={ind.label}
          data-testid={i === 0 ? 'sim-clock' : undefined}
          className="gap-0 border-border/70 bg-card/90 px-3 py-1.5 shadow-lg backdrop-blur"
        >
          <span className="font-mono text-[13px] leading-none text-foreground">{ind.value}</span>
          <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{ind.label}</span>
        </Card>
      ))}
    </div>
  );
});
