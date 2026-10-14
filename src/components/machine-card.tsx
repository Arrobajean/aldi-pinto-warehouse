'use client';

import { memo, useState } from 'react';
import {
  X,
  Crosshair,
  User,
  Gauge,
  Briefcase,
  Thermometer,
  Layers,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import type { Machine, SimState, Truck } from '@/lib/sim/types';
import type { GeofenceAlert } from '@/lib/rtls/geofences';
import { getWorkerByMachineId, getWorkerLiveActivity, type WorkerDocument } from '@/data/workersDatabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<string, string> = {
  retractil: 'Retráctil Jungheinrich ETV/ETM 214-216',
  frontal: 'ERE 225i (Jungheinrich)',
  recogepedidos: 'Recogepedidos Jungheinrich ECD 320',
  transpaleta: 'Transpaleta ESE Jungheinrich',
};

interface MachineCardProps {
  state: SimState;
  entity: { kind: 'machine' | 'truck'; id: string };
  alerts: GeofenceAlert[];
  following: boolean;
  onFollow: (id: string, follow: boolean) => void;
  onClose: () => void;
}

function getHeaderDotColor(machine: Machine | null | undefined, worker: WorkerDocument | null | undefined): string {
  if (!machine) return 'bg-orange';
  if (worker?.department === 'preparacion') return 'bg-emerald-400';
  if (worker?.department === 'recepcion') return 'bg-sky-400';
  return 'bg-amber-400';
}

const DEPT_BADGE: Record<string, string> = {
  preparacion: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  recepcion: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  expedicion: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
};

const ZONE_BADGE: Record<string, string> = {
  frio: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-300',
  congelado: 'border-indigo-400/40 bg-indigo-500/15 text-indigo-300',
  seco: 'border-slate-400/40 bg-slate-500/15 text-slate-200',
};

function WorkerDetails({ worker, machine, liveActivity }: { worker: WorkerDocument; machine: Machine; liveActivity: string | null }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col rounded-lg border bg-card/60 p-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Departamento</span>
          <span className={cn('mt-1 inline-flex items-center gap-1.5 self-start rounded border px-2 py-0.5 text-xs font-bold', DEPT_BADGE[worker.department])}>
            <Layers className="size-3" />
            {worker.departmentLabel}
          </span>
        </div>

        <div className="flex flex-col rounded-lg border bg-card/60 p-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Zona Asignada</span>
          <span className={cn('mt-1 inline-flex items-center gap-1.5 self-start rounded border px-2 py-0.5 text-xs font-bold', ZONE_BADGE[worker.assignedZone])}>
            <Thermometer className="size-3" />
            {worker.assignedZoneLabel}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/10 p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
          <Briefcase className="size-3.5" />
          <span>Tarea Asignada Hoy</span>
        </div>
        <p className="text-xs font-semibold leading-relaxed">{worker.todayTask}</p>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-card/50 p-2 text-xs">
        <Radio className="mt-0.5 size-3.5 flex-none animate-pulse text-success" />
        <div className="flex-1">
          <span className="text-[10px] font-medium text-muted-foreground">Actividad en tiempo real:</span>
          <p className="font-medium">{liveActivity}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-lg border bg-card/30 p-2 text-xs">
        <Row k="Puesto" v={worker.role} />
        <Row k="Turno" v={worker.shift} />
        <Row k="Máquina asignada" v={`${worker.machineId} (${machine.kind})`} />
        <Row k="Antigüedad" v={`${worker.antiguedadAnios} años`} />
      </div>
    </div>
  );
}

function MachineTelemetry({ machine, worker }: { machine: Machine; worker?: WorkerDocument | null }) {
  return (
    <dl className="flex flex-col gap-2">
      <Row k="Máquina" v={KIND_LABEL[machine.kind] ?? machine.kind} />
      <Row k="ID Flota" v={machine.id} />
      <Row k="Operario" v={worker?.name ?? machine.operatorName} />
      <Row k="Velocidad" v={`${(machine.speed * 3.6).toFixed(1)} km/h`} />
      <Row k="Batería" v={`${machine.battery.toFixed(0)} %`} />
      <Row k="Horas de uso" v={`${machine.hoursUsed.toFixed(1)} h`} />
      <Row k="Estado" v={machine.status} />
      <Row k="Carga horquillas" v={machine.hasPalet ? `${machine.carriedPalets.length} palet(s)` : 'Vacía'} />
      {machine.spot && <Row k="Plaza asignada" v={machine.spot} />}
    </dl>
  );
}

function TruckDetails({ truck }: { truck: Truck }) {
  const thermal = truck.temp === 'cool' ? 'Frío' : truck.temp === 'frozen' ? 'Congelado' : 'Seco';
  return (
    <dl className="flex flex-col gap-2">
      <Row k="Dirección" v={truck.direction === 'inbound' ? 'Entrada (Proveedor)' : 'Salida (Tiendas ALDI)'} />
      <Row k="Muelle" v={truck.dockId ?? 'En patio / espera'} />
      <Row k="Categoría Térmica" v={thermal} />
      <Row k="Estado" v={truck.status} />
      <Row k="Palets a bordo" v={String(truck.cargoPaletIds.length)} />
    </dl>
  );
}

function EntityHeader({
  machine,
  truck,
  worker,
  onClose,
}: {
  machine?: Machine | null;
  truck?: Truck | null;
  worker?: WorkerDocument | null;
  onClose: () => void;
}) {
  const title = machine
    ? `${machine.id} · ${worker?.name ?? machine.operatorName}`
    : `${truck?.id} · Camión ${truck?.plate}`;

  const subtitle = machine
    ? worker
      ? `${worker.role} · ${worker._id}`
      : KIND_LABEL[machine.kind]
    : `Matrícula ${truck?.plate}`;

  return (
    <header className="mb-2.5 flex items-center gap-2.5 border-b pb-2.5">
      <span className={cn('size-3 flex-none rounded-full', getHeaderDotColor(machine, worker))} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold">{title}</h2>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={onClose} aria-label="Cerrar ficha">
        <X />
      </Button>
    </header>
  );
}

function AlertsList({ alerts }: { alerts: GeofenceAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="mt-2.5 border-t pt-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-destructive">
        <AlertTriangle className="size-3" /> Alertas RTLS
      </div>
      <ul className="flex flex-col gap-1">
        {alerts.map((a) => (
          <li key={a.id} className="flex items-start gap-1.5 text-[11px] leading-snug text-destructive">
            <span className="mt-0.5 size-1.5 flex-none rounded-full bg-destructive" />
            {a.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FollowButton({
  entityId,
  following,
  onFollow,
}: {
  entityId: string;
  following: boolean;
  onFollow: (id: string, follow: boolean) => void;
}) {
  return (
    <Button
      variant={following ? 'default' : 'outline'}
      className="mt-3 w-full"
      onClick={() => onFollow(entityId, !following)}
    >
      <Crosshair />
      {following ? 'Dejar de seguir' : 'Seguir con la cámara'}
    </Button>
  );
}

function useEntityCardData(state: SimState, entity: MachineCardProps['entity'], alerts: MachineCardProps['alerts']) {
  const machine = entity.kind === 'machine' ? state.machines.find((m) => m.id === entity.id) : null;
  const truck = entity.kind === 'truck' ? state.trucks.find((t) => t.id === entity.id) : null;
  const worker = machine ? getWorkerByMachineId(machine.id) : null;
  const currentTask = machine?.taskId ? state.tasks.find((t) => t.id === machine.taskId) : undefined;
  const liveActivity = worker && machine ? getWorkerLiveActivity(worker, machine, currentTask) : null;
  const tagAlerts = alerts.filter((a) => a.tagId === entity.id).slice(0, 5);

  return { machine, truck, worker, liveActivity, tagAlerts };
}

function MachineCardBody({
  machine,
  truck,
  worker,
  activeTab,
  liveActivity,
}: {
  machine?: Machine | null;
  truck?: Truck | null;
  worker?: WorkerDocument | null;
  activeTab: 'worker' | 'machine';
  liveActivity: ReturnType<typeof getWorkerLiveActivity> | null;
}) {
  if (truck) return <TruckDetails truck={truck} />;
  if (!machine) return null;
  if (activeTab === 'worker' && worker) {
    return <WorkerDetails worker={worker} machine={machine} liveActivity={liveActivity} />;
  }
  return <MachineTelemetry machine={machine} worker={worker} />;
}

export const MachineCard = memo(function MachineCard({ state, entity, alerts, following, onFollow, onClose }: MachineCardProps) {
  const [activeTab, setActiveTab] = useState<'worker' | 'machine'>('worker');
  const { machine, truck, worker, liveActivity, tagAlerts } = useEntityCardData(state, entity, alerts);

  if (!machine && !truck) return null;

  return (
    <Card className="absolute right-3 top-3 z-40 w-80 max-w-[calc(100vw-24px)] gap-0 border-border/70 bg-card/95 py-0 shadow-lg backdrop-blur">
      <CardContent className="p-3.5">
        <EntityHeader machine={machine} truck={truck} worker={worker} onClose={onClose} />
        {machine && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'worker' | 'machine')} className="mb-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="worker" className="gap-1.5 text-xs">
                <User className="size-3.5" />
                Trabajador
              </TabsTrigger>
              <TabsTrigger value="machine" className="gap-1.5 text-xs">
                <Gauge className="size-3.5" />
                Máquina
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <MachineCardBody
          machine={machine}
          truck={truck}
          worker={worker}
          activeTab={activeTab}
          liveActivity={liveActivity}
        />
        <AlertsList alerts={tagAlerts} />
        <FollowButton entityId={entity.id} following={following} onFollow={onFollow} />
      </CardContent>
    </Card>
  );
});

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="max-w-[58%] truncate text-right text-[12px] font-semibold">{v}</dd>
    </div>
  );
}
