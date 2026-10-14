/**
 * Capa de datos de Trabajadores de ALDI Pinto.
 *
 * Los datos se respaldan en la tabla `aldi_pinto.workers` de Supabase
 * (ver supabase/migrations/00003_workers.sql) y se precargan en memoria desde
 * `workers-seed.json` para garantizar consultas instantáneas (O(1)) a 60 FPS
 * en la simulación 3D y compatibilidad con SSR / modo sin conexión.
 */

import type { MachineKind, Machine, SimTask } from '@/lib/sim/types';
import seedWorkers from './workers-seed.json';

export type WorkerDepartment = 'preparacion' | 'recepcion' | 'expedicion';
export type WorkerThermalZone = 'seco' | 'frio' | 'congelado';
export type RotatingDayOff = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes' | 'Sábado';

export interface WorkerVacations {
  diasAnuales: number;
  diasDisfrutados: number;
  diasPendientes: number;
  proximoPeriodo: string;
  estado: 'planificadas' | 'disfrutando' | 'completadas';
}

export interface WorkerWeeklyRest {
  totalDiasLibresSemana: 2;
  diaFijo: 'Domingo';
  diaRotativoSemana: RotatingDayOff;
  descripcion: string;
}

export interface WorkerDocument {
  _id: string;
  name: string;
  department: WorkerDepartment;
  departmentLabel: 'Preparación' | 'Recepción' | 'Expedición';
  role: string;
  assignedZone: WorkerThermalZone;
  assignedZoneLabel: 'Seco' | 'Frío' | 'Congelado';
  todayTask: string;
  machineId: string;
  machineKind: MachineKind;
  machineModel: string;
  shift: string;
  sections?: string[];
  epi: string[];
  certificaciones: string[];
  antiguedadAnios: number;
  vacaciones: WorkerVacations;
  descansoSemanal: WorkerWeeklyRest;
}

// Dataset precargado en memoria (garantiza cero latencia en render 3D)
export const WORKERS_DATABASE: WorkerDocument[] = seedWorkers as WorkerDocument[];

// Índices rápidos en memoria para consultas inmediatas (O(1))
const BY_MACHINE_ID = new Map<string, WorkerDocument>(WORKERS_DATABASE.map((w) => [w.machineId, w]));
const BY_ID = new Map<string, WorkerDocument>(WORKERS_DATABASE.map((w) => [w._id, w]));
const BY_NAME = new Map<string, WorkerDocument>(WORKERS_DATABASE.map((w) => [w.name.toLowerCase(), w]));

export function getWorkerByMachineId(machineId: string): WorkerDocument | undefined {
  return BY_MACHINE_ID.get(machineId);
}

export function getWorkerById(workerId: string): WorkerDocument | undefined {
  return BY_ID.get(workerId);
}

export function getWorkerByName(name: string): WorkerDocument | undefined {
  return BY_NAME.get(name.toLowerCase().trim());
}

export function getAllWorkers(): WorkerDocument[] {
  return WORKERS_DATABASE;
}

export function getWorkersByDepartment(department: WorkerDepartment): WorkerDocument[] {
  return WORKERS_DATABASE.filter((w) => w.department === department);
}

export function getWorkersByZone(zone: WorkerThermalZone): WorkerDocument[] {
  return WORKERS_DATABASE.filter((w) => w.assignedZone === zone);
}

/**
 * Calcula el estado dinámico en tiempo real del trabajador combinando
 * su tarea asignada del día con la telemetría viva de la simulación.
 */
export function getWorkerLiveActivity(worker: WorkerDocument, machine?: Machine, currentTask?: SimTask): string {
  if (!machine) return 'En descanso / Fuera de servicio';

  switch (machine.status) {
    case 'charging':
      return 'Recargando máquina en sala de baterías oeste';
    case 'waiting':
      return 'Esperando despeje de pasillo o turno de maniobra';
    case 'idle':
      return 'Disponible en sala de máquinas, a la espera de nueva orden';
    case 'traveling':
      if (machine.hasPalet) {
        return `Transportando ${machine.carriedPalets.length > 0 ? machine.carriedPalets.join(', ') : 'palet'} a velocidad regulada`;
      }
      return 'En desplazamiento hacia punto de carga/recogida';
    case 'working':
      if (currentTask) {
        if (currentTask.kind === 'pick') return `Ejecutando picking en sección (${currentTask.section ?? worker.assignedZoneLabel})`;
        if (currentTask.kind === 'putaway') return `Ubicando palet en altura (rack ${currentTask.toLocId ?? 'reserva'})`;
        if (currentTask.kind === 'replenish') return `Bajando palet de reposición al nivel 0 (rack ${currentTask.toLocId ?? 'picking'})`;
        if (currentTask.kind === 'dock_shift') return `Cargando/descargando en muelle ${currentTask.dockId ?? 'Inbound'}`;
        if (currentTask.kind === 'transfer') return `Moviendo palet flejado a consolidación (${currentTask.dockId ?? 'salida'})`;
      }
      return `Operando máquina en zona de ${worker.departmentLabel}`;
    default:
      return 'Activo en turno';
  }
}
