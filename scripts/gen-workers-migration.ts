import fs from 'fs';
import path from 'path';

const seedPath = path.resolve(process.cwd(), 'src/data/workers-seed.json');
const data = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

let sql = `-- F6: Tabla de Trabajadores / Operarios de ALDI Pinto y Gestion de Turnos / Vacaciones

create table if not exists aldi_pinto.workers (
  id text primary key,
  name text not null,
  department text not null check (department in ('preparacion', 'recepcion', 'expedicion')),
  department_label text not null,
  role text not null,
  assigned_zone text not null check (assigned_zone in ('seco', 'frio', 'congelado')),
  assigned_zone_label text not null,
  today_task text not null,
  machine_id text not null,
  machine_kind text not null check (machine_kind in ('retractil', 'frontal', 'recogepedidos', 'transpaleta')),
  machine_model text not null,
  shift text not null,
  sections text[] not null default array[]::text[],
  epi text[] not null default array[]::text[],
  certificaciones text[] not null default array[]::text[],
  antiguedad_anios int not null default 1,
  descanso_semanal jsonb not null,
  vacaciones jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices de busqueda rapida
create index if not exists workers_department_idx on aldi_pinto.workers(department);
create index if not exists workers_assigned_zone_idx on aldi_pinto.workers(assigned_zone);
create index if not exists workers_machine_id_idx on aldi_pinto.workers(machine_id);

-- Politicas de seguridad Row Level Security (RLS)
alter table aldi_pinto.workers enable row level security;

create policy "workers_lectura_publica" on aldi_pinto.workers
  for select to anon, authenticated using (true);

create policy "workers_escritura_servicio" on aldi_pinto.workers
  for all to service_role using (true) with check (true);

-- Semilla inicial de los 41 trabajadores
insert into aldi_pinto.workers (
  id, name, department, department_label, role, assigned_zone, assigned_zone_label,
  today_task, machine_id, machine_kind, machine_model, shift, sections, epi, certificaciones,
  antiguedad_anios, descanso_semanal, vacaciones
) values
`;

interface WorkerSeed {
  _id: string;
  name: string;
  department: string;
  departmentLabel: string;
  role: string;
  assignedZone: string;
  assignedZoneLabel: string;
  todayTask: string;
  machineId: string;
  machineKind: string;
  machineModel: string;
  shift: string;
  sections?: string[];
  epi?: string[];
  certificaciones?: string[];
  antiguedadAnios?: number;
  descansoSemanal: unknown;
  vacaciones: unknown;
}

const rows = (data as WorkerSeed[]).map((w) => {
  const sectionsSql = 'ARRAY[' + (w.sections || []).map((s: string) => "'" + s.replace(/'/g, "''") + "'").join(',') + ']::text[]';
  const epiSql = 'ARRAY[' + (w.epi || []).map((s: string) => "'" + s.replace(/'/g, "''") + "'").join(',') + ']::text[]';
  const certSql = 'ARRAY[' + (w.certificaciones || []).map((s: string) => "'" + s.replace(/'/g, "''") + "'").join(',') + ']::text[]';
  const restJson = JSON.stringify(w.descansoSemanal).replace(/'/g, "''");
  const vacJson = JSON.stringify(w.vacaciones).replace(/'/g, "''");

  return `  (
    '${w._id}',
    '${w.name.replace(/'/g, "''")}',
    '${w.department}',
    '${w.departmentLabel}',
    '${w.role.replace(/'/g, "''")}',
    '${w.assignedZone}',
    '${w.assignedZoneLabel}',
    '${w.todayTask.replace(/'/g, "''")}',
    '${w.machineId}',
    '${w.machineKind}',
    '${w.machineModel.replace(/'/g, "''")}',
    '${w.shift.replace(/'/g, "''")}',
    ${sectionsSql},
    ${epiSql},
    ${certSql},
    ${w.antiguedadAnios},
    '${restJson}'::jsonb,
    '${vacJson}'::jsonb
  )`;
});

sql += rows.join(',\n') + `
on conflict (id) do update set
  today_task = excluded.today_task,
  assigned_zone = excluded.assigned_zone,
  descanso_semanal = excluded.descanso_semanal,
  vacaciones = excluded.vacaciones,
  updated_at = now();
`;

const outPath = path.resolve(process.cwd(), 'supabase/migrations/00003_workers.sql');
fs.writeFileSync(outPath, sql, 'utf8');
console.log('00003_workers.sql generated successfully');
