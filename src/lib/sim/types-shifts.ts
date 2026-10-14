/** Turnos de la plataforma y cálculo del turno a partir del instante de simulación. (extraído de types.ts) */

export interface ShiftPeriod {
  id: 'noche' | 'mañana' | 'tarde';
  startHour: number;
  endHour: number;
  /** Máquinas activas simultáneas objetivo. */
  machines: number;
}

/** Turnos reales de la plataforma: mañana 06:00–14:30, tarde 14:30–22:00. Fuera de turno, la nave descansa. */
export const SHIFTS: ShiftPeriod[] = [
  { id: 'mañana', startHour: 6, endHour: 14.5, machines: 26 },
  { id: 'tarde', startHour: 14.5, endHour: 22, machines: 20 },
  { id: 'noche', startHour: 22, endHour: 6, machines: 4 },
];

export function shiftAt(ts: number): ShiftPeriod {
  const hour = ((ts / 3600) % 24 + 24) % 24;
  for (const s of SHIFTS) {
    if (s.id === 'noche') {
      if (hour >= s.startHour || hour < SHIFTS[0].startHour) return s;
    } else if (hour >= s.startHour && hour < s.endHour) {
      return s;
    }
  }
  return SHIFTS[2];
}
