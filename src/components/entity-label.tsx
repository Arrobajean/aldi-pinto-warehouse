'use client';

import { memo } from 'react';
import type { EntityHit } from '@/hooks/use-rtls';
import type { SimState } from '@/lib/sim/types';
import { getWorkerByMachineId } from '@/data/workersDatabase';

interface EntityLabelProps {
  hover: EntityHit;
  state: SimState;
  following: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  retractil: 'Retráctil',
  frontal: 'ERE 225i',
  recogepedidos: 'Picker',
  transpaleta: 'Transpaleta',
};

const ZONE_ICONS: Record<string, string> = {
  frio: '❄️',
  congelado: '🧊',
  seco: '☀️',
};

const DEPT_BADGES: Record<string, { dot: string; badge: string }> = {
  preparacion: { dot: 'bg-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' },
  recepcion: { dot: 'bg-sky-400', badge: 'bg-sky-500/20 text-sky-300' },
  expedicion: { dot: 'bg-amber-400', badge: 'bg-amber-500/20 text-amber-300' },
};

function getEntityData(hover: EntityLabelProps['hover'], state: EntityLabelProps['state'], following: boolean) {
  if (hover.kind === 'machine') {
    const m = state.machines.find((x) => x.id === hover.id);
    if (!m) return null;
    const worker = getWorkerByMachineId(m.id);
    const deptInfo = worker ? DEPT_BADGES[worker.department] : undefined;
    const dotColor = following ? 'bg-orange' : (deptInfo?.dot ?? 'bg-amber-400');
    return {
      typeLabel: TYPE_LABELS[m.kind] ?? m.kind,
      operator: worker?.name ?? m.operatorName,
      battery: ` · ⚡ ${m.battery.toFixed(0)}%`,
      worker,
      zoneIcon: (worker?.assignedZone && ZONE_ICONS[worker.assignedZone]) ?? (worker ? '☀️' : ''),
  deptBadge: deptInfo?.badge ?? 'bg-secondary text-muted-foreground',
    dotColor,
    };
  }

  const t = state.trucks.find((x) => x.id === hover.id);
  if (!t) return null;
  return {
    typeLabel: 'Camión',
    operator: t.plate,
    battery: '',
    worker: null,
    zoneIcon: '',
    deptBadge: '',
    dotColor: following ? 'bg-orange' : 'bg-success',
  };
}

/** Etiqueta flotante sobre una máquina/camión. El padre posiciona el div. */
export const EntityLabel = memo(function EntityLabel({ hover, state, following }: EntityLabelProps) {
  const data = getEntityData(hover, state, following);
  if (!data) return null;

  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-primary/60 bg-card/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
      <span className={`h-2 w-2 flex-none rounded-full ${data.dotColor}`} />
      <span className="whitespace-nowrap font-mono text-[12px] font-semibold text-foreground">{hover.id}</span>
      <span className="whitespace-nowrap text-[10px] uppercase tracking-wider text-muted-foreground">{data.typeLabel}</span>

      {data.worker && (
        <span
          className={`whitespace-nowrap rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${data.deptBadge}`}
        >
          {data.zoneIcon} {data.worker.departmentLabel.slice(0, 4)}.
        </span>
      )}

      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {data.operator}
        {data.battery}
      </span>
    </div>
  );
});