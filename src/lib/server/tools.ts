import 'server-only';

import type { LiveSnapshot, UiAction } from '@/lib/chat';
import { articleForSku } from '@/lib/stock/catalog';
import { getWorkerByMachineId, getWorkerByName, getAllWorkers } from '@/data/workersDatabase';

const kindLabel: Record<string, string> = { retractil: 'Retráctil', frontal: 'ERE 225i', recogepedidos: 'Recogepedidos', transpaleta: 'Transpaleta ESE' };

export const LIVE_TOOLS = [
  {
    name: 'get_machine',
    description: 'Telemetría de una máquina (retráctil, frontal, recogepedidos, transpaleta) por su id.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id de la máquina, p. ej. R-07' } },
      required: ['id'],
    },
  },
  {
    name: 'find_machines',
    description: 'Busca máquinas por tipo o estado (por ejemplo todas las retráctiles en espera).',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['retractil', 'frontal', 'recogepedidos', 'transpaleta'] },
        status: { type: 'string', enum: ['idle', 'traveling', 'working', 'waiting', 'charging'] },
      },
      required: [],
    },
  },
  {
    name: 'get_dock_status',
    description: 'Estado de todos los muelles (ocupados, libres, en carga/descarga).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_trucks',
    description: 'Camiones en la plataforma, opcionalmente filtrados por dirección o estado.',
    parameters: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['inbound', 'outbound'] },
        status: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_stock',
    description: 'Stock de un SKU o el contenido de una ubicación concreta.',
    parameters: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Código de artículo, p. ej. SKU-1234' },
        location: { type: 'string', description: 'Código de ubicación, p. ej. S-07-12-3-B' },
      },
      required: [],
    },
  },
  {
    name: 'get_alerts',
    description: 'Alertas y eventos recientes del almacén.',
    parameters: {
      type: 'object',
      properties: { since: { type: 'number', description: 'timestamp de simulación desde el que listar' } },
      required: [],
    },
  },
  {
    name: 'get_kpis',
    description: 'Indicadores resumidos del día (palets recibidos, ubicados, preparados, expedidos, camiones).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_worker_info',
    description: 'Consulta datos de un trabajador (departamento: preparación, recepción o expedición; tarea asignada hoy; zona: seco, frío o congelado; máquina y turno) por nombre o id de máquina.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre del trabajador (p. ej. "Elena Carrasco") o id de máquina (p. ej. "P-01")' },
        departamento: { type: 'string', enum: ['preparacion', 'recepcion', 'expedicion'], description: 'Filtrar por departamento' },
        zona: { type: 'string', enum: ['seco', 'frio', 'congelado'], description: 'Filtrar por zona' },
      },
      required: [],
    },
  },
];

/** Resuelve una llamada de herramienta contra el snapshot del estado en vivo. */
export function resolveTool(name: string, args: Record<string, unknown>, snapshot: LiveSnapshot): { result: unknown; uiActions: UiAction[] } {
  const uiActions: UiAction[] = [];
  let result: unknown = null;

  switch (name) {
    case 'get_worker_info': {
      const q = String(args.query ?? '').trim().toLowerCase();
      const dep = args.departamento as import('@/data/workersDatabase').WorkerDepartment | undefined;
      const z = args.zona as import('@/data/workersDatabase').WorkerThermalZone | undefined;

      if (q) {
        const worker = getWorkerByMachineId(q.toUpperCase()) ?? getWorkerByName(q);
        if (worker) {
          const liveMachine = snapshot.machines.find((m) => m.id.toUpperCase() === worker.machineId.toUpperCase());
          result = {
            id: worker._id,
            nombre: worker.name,
            departamento: worker.departmentLabel,
            tareaHoy: worker.todayTask,
            zonaAsignada: worker.assignedZoneLabel,
            puesto: worker.role,
            maquina: `${worker.machineId} (${worker.machineModel})`,
            turno: worker.shift,
            diasLibresSemanales: worker.descansoSemanal.descripcion,
            diaRotativoSemana: worker.descansoSemanal.diaRotativoSemana,
            vacaciones: `${worker.vacaciones.diasAnuales} días/año (${worker.vacaciones.diasPendientes} pendientes, próximo: ${worker.vacaciones.proximoPeriodo})`,
            estadoVivo: liveMachine?.status ?? 'activo',
          };
          uiActions.push({ type: 'focus_entity', target: worker.machineId, label: `${worker.name} · ${worker.departmentLabel}` });
        } else {
          result = { error: `No se encontró ningún trabajador con la consulta "${q}"` };
        }
      } else {
        let workers = getAllWorkers();
        if (dep) workers = workers.filter((w) => w.department === dep);
        if (z) workers = workers.filter((w) => w.assignedZone === z);
        result = {
          total: workers.length,
          trabajadores: workers.map((w) => ({
            id: w._id,
            nombre: w.name,
            departamento: w.departmentLabel,
            tareaHoy: w.todayTask,
            zonaAsignada: w.assignedZoneLabel,
            maquina: w.machineId,
            diasLibres: `Dom + ${w.descansoSemanal.diaRotativoSemana}`,
            vacacionesPendientes: `${w.vacaciones.diasPendientes} días (${w.vacaciones.proximoPeriodo})`,
          })),
        };
      }
      break;
    }
    case 'get_machine': {
      const id = String(args.id ?? '');
      const m = snapshot.machines.find((x) => x.id === id);
      const worker = getWorkerByMachineId(id);
      result = m
        ? {
            ...m,
            tipo: kindLabel[m.kind] ?? m.kind,
            trabajador: worker
              ? {
                  id: worker._id,
                  nombre: worker.name,
                  departamento: worker.departmentLabel,
                  tareaHoy: worker.todayTask,
                  zonaAsignada: worker.assignedZoneLabel,
                  rol: worker.role,
                  turno: worker.shift,
                  diasLibres: worker.descansoSemanal.descripcion,
                  vacacionesPendientes: `${worker.vacaciones.diasPendientes} días`,
                }
              : null,
          }
        : { error: `No existe la máquina ${id}` };
      if (m) {
        uiActions.push({
          type: 'focus_entity',
          target: id,
          label: `${id} · ${worker ? `${worker.name} (${worker.departmentLabel})` : kindLabel[m.kind] ?? m.kind}`,
        });
      }
      break;
    }
    case 'find_machines': {
      const kind = args.kind as string | undefined;
      const status = args.status as string | undefined;
      result = snapshot.machines.filter((m) => (!kind || m.kind === kind) && (!status || m.status === status));
      break;
    }
    case 'get_dock_status': {
      const busy = snapshot.docks.filter((d) => d.truck).length;
      result = { total: snapshot.docks.length, ocupados: busy, libres: snapshot.docks.length - busy, muelles: snapshot.docks };
      break;
    }
    case 'get_trucks': {
      const direction = args.direction as string | undefined;
      const status = args.status as string | undefined;
      result = snapshot.trucks.filter((t) => (!direction || t.direction === direction) && (!status || t.status === status));
      break;
    }
    case 'get_stock': {
      const sku = args.sku as string | undefined;
      const location = args.location as string | undefined;
      if (sku) {
        const count = snapshot.palets.byTemp[sku.slice(0, 1).toLowerCase()] ?? 0;
        const art = articleForSku(sku);
        result = {
          sku,
          nombre: art.name,
          marca: art.brand,
          categoriaComercial: art.commercialCategory,
          familia: art.family,
          temperatura: art.temp,
          rotacion: art.rotation,
          vidaUtilDias: art.shelfLifeDays,
          paletsEnNave: count,
        };
      } else if (location) {
        uiActions.push({ type: 'focus_location', target: location, label: location });
        result = { ubicacion: location, contenido: 'Consultable en el visor (modo stock)' };
      } else {
        result = { error: 'Indica sku o location' };
      }
      break;
    }
    case 'get_alerts': {
      const since = Number(args.since ?? 0);
      result = snapshot.alerts.filter((a) => a.ts >= since);
      break;
    }
    case 'get_kpis':
      result = {
        ...snapshot.stats,
        paletsEnStock: snapshot.palets.byState.stored ?? 0,
        ocupacionMuelles: `${snapshot.docks.filter((d) => d.truck).length}/${snapshot.docks.length}`,
      };
      break;
    default:
      result = { error: `Herramienta desconocida: ${name}` };
  }

  return { result, uiActions };
}