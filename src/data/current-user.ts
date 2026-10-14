export interface UserActivity {
  id: string;
  label: string;
  time: string;
  kind: 'query' | 'focus' | 'alert' | 'shift';
}

export interface UserPreference {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface CurrentUser {
  name: string;
  initials: string;
  role: string;
  email: string;
  phone: string;
  site: string;
  shift: string;
  department: string;
  employeeId: string;
  memberSince: string;
  kpis: { label: string; value: string; hint: string }[];
  preferences: UserPreference[];
  activity: UserActivity[];
}

export const CURRENT_USER: CurrentUser = {
  name: 'Elena Navarro',
  initials: 'EN',
  role: 'Jefa de Operaciones',
  email: 'elena.navarro@aldi.es',
  phone: '+34 912 345 678',
  site: 'Plataforma Logística Pinto',
  shift: 'Turno A · 06:00 – 14:00',
  department: 'Operaciones de almacén',
  employeeId: 'ALDI-PTO-0421',
  memberSince: 'marzo 2019',
  kpis: [
    { label: 'Consultas IA', value: '184', hint: 'este mes' },
    { label: 'Días activos', value: '21', hint: 'últimos 30' },
    { label: 'Incidencias resueltas', value: '37', hint: 'último trimestre' },
    { label: 'Satisfacción', value: '4,8', hint: 'sobre 5' },
  ],
  preferences: [
    {
      id: 'notify-alerts',
      label: 'Alertas de geovalla (RTLS)',
      description: 'Avisar cuando una máquina entra en una zona restringida.',
      enabled: true,
    },
    {
      id: 'notify-fefo',
      label: 'Avisos de caducidad FEFO',
      description: 'Notificar palés con menos de 8 días de vida útil.',
      enabled: true,
    },
    {
      id: 'notify-shift',
      label: 'Resumen de cambio de turno',
      description: 'Recibir el informe al inicio y fin de turno.',
      enabled: false,
    },
  ],
  activity: [
    { id: 'a1', label: 'Preguntó por la ocupación de la cámara de frío', time: 'Hoy · 09:12', kind: 'query' },
    { id: 'a2', label: 'Centró la vista en la flejadora FLJ-01', time: 'Hoy · 08:47', kind: 'focus' },
    { id: 'a3', label: 'Gestionó 3 alertas de geovalla en muelles', time: 'Ayer · 17:30', kind: 'alert' },
    { id: 'a4', label: 'Cerró el turno A con 98,4 % de fiabilidad', time: 'Ayer · 14:05', kind: 'shift' },
    { id: 'a5', label: 'Consultó el stock de la familia de lácteos', time: 'Ayer · 11:22', kind: 'query' },
  ],
};
