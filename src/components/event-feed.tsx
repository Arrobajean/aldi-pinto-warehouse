'use client';

import { useState } from 'react';
import { Radio, X } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import type { GeofenceAlert } from '@/lib/rtls/geofences';
import { formatSimTime } from '@/lib/sim/clock';

interface EventFeedProps {
  state: SimState;
  rtlsAlerts?: GeofenceAlert[];
}

const COLORS: Record<string, string> = {
  truck_arrived: 'text-accent',
  truck_weighted: 'text-muted',
  truck_docked: 'text-ok',
  truck_unloading: 'text-accent',
  truck_loading: 'text-orange',
  truck_left: 'text-ok',
  pallet_received: 'text-ok',
  pallet_stored: 'text-muted',
  pallet_picked: 'text-accent',
  pallet_prepared: 'text-warn',
  shift_change: 'text-ok',
  machine_low_battery: 'text-alert',
  machine_waiting: 'text-warn',
};

export function EventFeed({ state, rtlsAlerts = [] }: EventFeedProps) {
  const [open, setOpen] = useState(true);
  const events = state.events.slice(-40).reverse();

  return (
    <div className="pointer-events-auto absolute right-3 bottom-[150px] z-30 w-72 max-w-[calc(100vw-24px)] rounded-card border border-line bg-panel/90 shadow-card backdrop-blur md:bottom-[150px]">
      <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-[11px] uppercase tracking-wider text-muted">
        <Radio size={13} className="text-ok" />
        Actividad en directo
        <button className="ml-auto p-0.5 text-muted hover:text-fg" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={13} /> : <Radio size={13} />}
        </button>
      </div>
      {open && (
        <ul className="max-h-[200px] overflow-y-auto p-1.5 text-[11px] leading-snug">
          {rtlsAlerts.slice(0, 6).map((a) => (
            <li key={a.id} className="flex gap-2 px-1 py-0.5">
              <span className="flex-none font-mono text-muted">{formatSimTime(a.ts)}</span>
              <span className="text-alert">[RTLS] {a.message}</span>
            </li>
          ))}
          {events.map((ev, i) => (
            <li key={`${ev.ts}-${i}`} className="flex gap-2 px-1 py-0.5">
              <span className="flex-none font-mono text-muted">{formatSimTime(ev.ts)}</span>
              <span className={COLORS[ev.type] ?? 'text-fg'}>{ev.message}</span>
            </li>
          ))}
          {events.length === 0 && rtlsAlerts.length === 0 && <li className="px-1 py-1 text-muted">Sin eventos todavía.</li>}
        </ul>
      )}
    </div>
  );
}