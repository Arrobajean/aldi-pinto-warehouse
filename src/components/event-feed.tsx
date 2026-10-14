'use client';

import { memo, useState } from 'react';
import { Radio, Minus, Plus } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import type { GeofenceAlert } from '@/lib/rtls/geofences';
import { formatSimTime } from '@/lib/sim/clock';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EventFeedProps {
  state: SimState;
  rtlsAlerts?: GeofenceAlert[];
}

const COLORS: Record<string, string> = {
  truck_arrived: 'text-primary',
  truck_weighted: 'text-muted-foreground',
  truck_docked: 'text-success',
  truck_unloading: 'text-primary',
  truck_loading: 'text-orange',
  truck_left: 'text-success',
  pallet_received: 'text-success',
  pallet_stored: 'text-muted-foreground',
  pallet_picked: 'text-primary',
  pallet_prepared: 'text-warning',
  shift_change: 'text-success',
  machine_low_battery: 'text-destructive',
  machine_waiting: 'text-warning',
};

export const EventFeed = memo(function EventFeed({ state, rtlsAlerts = [] }: EventFeedProps) {
  const [open, setOpen] = useState(true);
  const events = state.events.slice(-40).reverse();

  return (
    <Card className="pointer-events-auto absolute bottom-[150px] right-3 z-30 w-72 max-w-[calc(100vw-24px)] gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur">
      <CardHeader className="border-b px-3 py-2">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <Radio className="size-3.5 text-success" />
          Actividad en directo
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-6 text-muted-foreground"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Minimizar feed de eventos' : 'Expandir feed de eventos'}
          >
            {open ? <Minus /> : <Plus />}
          </Button>
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="p-1.5">
          <ScrollArea className="max-h-[200px]">
            <ul className="text-[11px] leading-snug">
              {rtlsAlerts.slice(0, 6).map((a) => (
                <li key={a.id} className="flex gap-2 px-1 py-0.5">
                  <span className="flex-none font-mono text-muted-foreground">{formatSimTime(a.ts)}</span>
                  <span className="text-destructive">[RTLS] {a.message}</span>
                </li>
              ))}
              {events.map((ev) => (
                <li key={ev.id} className="flex gap-2 px-1 py-0.5">
                  <span className="flex-none font-mono text-muted-foreground">{formatSimTime(ev.ts)}</span>
                  <span className={COLORS[ev.type] ?? 'text-foreground'}>{ev.message}</span>
                </li>
              ))}
              {events.length === 0 && rtlsAlerts.length === 0 && (
                <li className="px-1 py-1 text-muted-foreground">Sin eventos todavía.</li>
              )}
            </ul>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
});
