'use client';

import { X, Crosshair } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import type { GeofenceAlert } from '@/lib/rtls/geofences';

const KIND_LABEL: Record<string, string> = {
  retractil: 'Retráctil',
  frontal: 'Frontal',
  recogepedidos: 'Recogepedidos',
};

interface MachineCardProps {
  state: SimState;
  entity: { kind: 'machine' | 'truck'; id: string };
  alerts: GeofenceAlert[];
  following: boolean;
  onFollow: (id: string, follow: boolean) => void;
  onClose: () => void;
}

export function MachineCard({ state, entity, alerts, following, onFollow, onClose }: MachineCardProps) {
  const machine = entity.kind === 'machine' ? state.machines.find((m) => m.id === entity.id) : null;
  const truck = entity.kind === 'truck' ? state.trucks.find((t) => t.id === entity.id) : null;
  if (!machine && !truck) return null;

  const tagAlerts = alerts.filter((a) => a.tagId === entity.id).slice(0, 5);
  const title = machine
    ? `${machine.id} · ${KIND_LABEL[machine.kind] ?? machine.kind}`
    : `${truck?.id} · Camión ${truck?.plate}`;

  return (
    <aside className="absolute right-3 top-3 z-40 w-72 max-w-[calc(100vw-24px)] rounded-card border border-line bg-panel/95 p-3.5 shadow-card backdrop-blur">
      <header className="mb-2 flex items-center gap-2.5">
        <span className={`h-3 w-3 flex-none rounded-full ${machine ? 'bg-accent' : 'bg-orange'}`} />
        <h2 className="flex-1 truncate text-[15px] font-bold text-fg">{title}</h2>
        <button className="p-0.5 text-muted transition-colors hover:text-fg" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <dl className="flex flex-col gap-2">
        {machine && (
          <>
            <Row k="Operario" v={machine.operatorName} />
            <Row k="Velocidad" v={`${(machine.speed * 3.6).toFixed(1)} km/h`} />
            <Row k="Batería" v={`${machine.battery.toFixed(0)} %`} />
            <Row k="Horas de uso" v={`${machine.hoursUsed.toFixed(1)} h`} />
            <Row k="Estado" v={machine.status} />
          </>
        )}
        {truck && (
          <>
            <Row k="Dirección" v={truck.direction === 'inbound' ? 'Entrada' : 'Salida'} />
            <Row k="Muelle" v={truck.dockId ?? '—'} />
            <Row k="Categoría" v={truck.temp} />
            <Row k="Estado" v={truck.status} />
          </>
        )}
      </dl>

      {tagAlerts.length > 0 && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted">Alertas RTLS</div>
          <ul className="flex flex-col gap-1">
            {tagAlerts.map((a) => (
              <li key={a.id} className="flex items-start gap-1.5 text-[11px] leading-snug text-alert">
                <span className="mt-0.5 h-1.5 w-1.5 flex-none rounded-full bg-alert" />
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
          following ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-panel-strong text-fg hover:border-accent'
        }`}
        onClick={() => onFollow(entity.id, !following)}
      >
        <Crosshair size={14} />
        {following ? 'Dejar de seguir' : 'Seguir con la cámara'}
      </button>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="max-w-[55%] truncate text-right text-[13px] font-semibold text-fg">{v}</dd>
    </div>
  );
}