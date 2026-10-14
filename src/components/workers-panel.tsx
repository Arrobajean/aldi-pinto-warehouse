'use client';

import { useState, useMemo, memo } from 'react';
import { Search, Users, Briefcase, Crosshair } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import {
  getAllWorkers,
  getWorkerLiveActivity,
  type WorkerDepartment,
  type WorkerThermalZone,
} from '@/data/workersDatabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface WorkersPanelProps {
  open: boolean;
  onClose: () => void;
  state: SimState;
  onSelectWorker: (machineId: string) => void;
}

const DEPT_STYLE: Record<WorkerDepartment, string> = {
  preparacion: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  recepcion: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  expedicion: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
};

const ZONE_STYLE: Record<WorkerThermalZone, string> = {
  frio: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  congelado: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  seco: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const ZONE_LABEL: Record<WorkerThermalZone, string> = {
  frio: '❄️ Frío',
  congelado: '🧊 Congelado',
  seco: '☀️ Seco',
};

function WorkersPanelBase({ open, onClose, state, onSelectWorker }: WorkersPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<WorkerDepartment | 'all'>('all');
  const [selectedZone, setSelectedZone] = useState<WorkerThermalZone | 'all'>('all');

  const allWorkers = useMemo(() => getAllWorkers(), []);

  const machineMap = useMemo(() => new Map(state.machines.map((m) => [m.id, m])), [state.machines]);
  const taskMap = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks]);

  const counts = useMemo(
    () => ({
      all: allWorkers.length,
      preparacion: allWorkers.filter((w) => w.department === 'preparacion').length,
      recepcion: allWorkers.filter((w) => w.department === 'recepcion').length,
      expedicion: allWorkers.filter((w) => w.department === 'expedicion').length,
    }),
    [allWorkers],
  );

  const filteredWorkers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return allWorkers.filter((w) => {
      if (selectedDept !== 'all' && w.department !== selectedDept) return false;
      if (selectedZone !== 'all' && w.assignedZone !== selectedZone) return false;
      if (q) {
        const matchName = w.name.toLowerCase().includes(q);
        const matchId = w._id.toLowerCase().includes(q) || w.machineId.toLowerCase().includes(q);
        const matchTask = w.todayTask.toLowerCase().includes(q);
        const matchRole = w.role.toLowerCase().includes(q);
        if (!matchName && !matchId && !matchTask && !matchRole) return false;
      }
      return true;
    });
  }, [allWorkers, search, selectedDept, selectedZone]);

  const resetFilters = () => {
    setSearch('');
    setSelectedDept('all');
    setSelectedZone('all');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-secondary/40 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Users className="size-4.5" />
            </span>
            <div className="text-left">
              <DialogTitle className="flex items-center gap-2 text-base">
                Plantilla de Trabajadores
                <Badge variant="secondary" className="bg-success/15 font-mono text-success">
                  {allWorkers.length} activos
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Asignación de departamentos, tareas del día y zonas térmicas (Seco, Frío, Congelado)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b bg-secondary/20 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por nombre, ID, máquina (ej. P-01) o tarea..."
                aria-label="Buscar trabajadores por nombre, ID o máquina"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-1 text-xs">
              <span className="mr-1 text-[11px] font-medium text-muted-foreground">Zona:</span>
              {(['all', 'seco', 'frio', 'congelado'] as const).map((z) => (
                <Button
                  key={z}
                  size="sm"
                  variant={selectedZone === z ? 'default' : 'outline'}
                  onClick={() => setSelectedZone(z)}
                  className="h-7 px-2 text-xs font-semibold"
                >
                  {z === 'all' ? 'Todas' : ZONE_LABEL[z]}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">Departamento:</span>
            <Button
              size="sm"
              variant={selectedDept === 'all' ? 'default' : 'outline'}
              onClick={() => setSelectedDept('all')}
              className="h-7 px-2.5 text-xs font-semibold"
            >
              Todos ({counts.all})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedDept('preparacion')}
              className={cn(
                'h-7 px-2.5 text-xs font-semibold',
                selectedDept === 'preparacion'
                  ? 'border-emerald-500 bg-emerald-500 text-black hover:bg-emerald-500'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
              )}
            >
              Preparación ({counts.preparacion})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedDept('recepcion')}
              className={cn(
                'h-7 px-2.5 text-xs font-semibold',
                selectedDept === 'recepcion'
                  ? 'border-sky-500 bg-sky-500 text-black hover:bg-sky-500'
                  : 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
              )}
            >
              Recepción ({counts.recepcion})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedDept('expedicion')}
              className={cn(
                'h-7 px-2.5 text-xs font-semibold',
                selectedDept === 'expedicion'
                  ? 'border-amber-500 bg-amber-500 text-black hover:bg-amber-500'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
              )}
            >
              Expedición ({counts.expedicion})
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {filteredWorkers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Users className="mb-2 size-8 opacity-50" />
                <p className="text-sm font-semibold">No se encontraron trabajadores con esos criterios</p>
                <Button variant="link" onClick={resetFilters} className="mt-1 text-xs">
                  Limpiar filtros
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredWorkers.map((worker) => {
                  const machine = machineMap.get(worker.machineId);
                  const currentTask = machine?.taskId ? taskMap.get(machine.taskId) : undefined;
                  const liveStatus = machine ? getWorkerLiveActivity(worker, machine, currentTask) : 'Fuera de servicio';

                  return (
                    <div
                      key={worker._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelectWorker(worker.machineId);
                        onClose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectWorker(worker.machineId);
                          onClose();
                        }
                      }}
                      aria-label={`Seleccionar trabajador ${worker.name}`}
                      className="group flex cursor-pointer flex-col justify-between rounded-lg border bg-secondary/60 p-3.5 text-left shadow-sm transition-colors hover:border-primary hover:bg-secondary"
                    >
                      <div>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold transition-colors group-hover:text-primary">{worker.name}</span>
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {worker._id}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{worker.role}</span>
                          </div>

                          <div className="flex flex-none flex-col items-end gap-1">
                            <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', DEPT_STYLE[worker.department])}>
                              {worker.departmentLabel}
                            </span>
                            <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', ZONE_STYLE[worker.assignedZone])}>
                              {ZONE_LABEL[worker.assignedZone]}
                            </span>
                          </div>
                        </div>

                        <div className="mb-2.5 rounded-md border bg-card/70 p-2 text-xs">
                          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase text-primary">
                            <Briefcase className="size-3" />
                            <span>Tarea Asignada Hoy:</span>
                          </div>
                          <p className="mb-1.5 line-clamp-2 font-medium leading-snug">{worker.todayTask}</p>
                          <div className="truncate border-t pt-1 text-[10px] text-muted-foreground">📍 {liveStatus}</div>
                        </div>

                      </div>

                      <Separator className="my-0" />
                      <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-foreground">🚜 {worker.machineId}</span>
                          {machine && <span className="text-[11px]">⚡ {machine.battery.toFixed(0)}%</span>}
                        </div>
                        <div className="flex items-center gap-1 font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                          <Crosshair className="size-3" />
                          <span>Ver en 3D</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export const WorkersPanel = memo(WorkersPanelBase);
