'use client';

import { memo } from 'react';
import { Truck } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DockListProps {
  state: SimState;
}

export const DockList = memo(function DockList({ state }: DockListProps) {
  const active = state.dockStates.filter((d) => d.truckId !== null);
  const activeCount = active.length;
  const truckMap = new Map(state.trucks.map((t) => [t.id, t]));

  return (
    <Card className="pointer-events-auto absolute right-3 top-[52px] z-30 hidden w-64 gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur lg:flex">
      <CardHeader className="border-b px-3 py-2">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Truck className="size-3.5 text-primary" />
          Muelles activos · {activeCount}/{state.dockStates.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-1.5">
        <ScrollArea className="max-h-[240px]">
          {activeCount === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Sin camiones atracados</p>}
          {active.map((d) => {
            const truck = d.truckId ? truckMap.get(d.truckId) : undefined;
            const pct = d.totalPalets > 0 ? Math.round((d.paletsProcessed / d.totalPalets) * 100) : 0;
            return (
              <div key={d.dockId} className="mb-1 rounded-lg bg-secondary px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs font-semibold">{d.dockId}</span>
                  <Badge
                    variant="secondary"
                    className={cn('h-5 text-[10px] uppercase', d.state === 'loading' ? 'text-orange' : 'text-primary')}
                  >
                    {d.state}
                  </Badge>
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">{truck ? truck.plate : '—'}</div>
                <Progress value={pct || 12} className="mt-1.5 h-1" />
              </div>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
});
