import type { Pallet } from '@/lib/sim/types';
import { AISLE_FAMILY_MAP } from '@/lib/stock/catalog';

export type TurnoId = 'mañana' | 'tarde' | 'noche';
export type ZonaPreparacion = Pallet['temp'];

/**
 * Preparadores presentes por turno y zona (cada uno es un recogepedidos físico, ver work-roster.ts). Dimensionado
 * para que la capacidad cubra el volumen de un día (unas 590 h de preparación): mañana 40 × 8,5 h = 340 h y tarde
 * 37 × 7,5 h ≈ 278 h. Por zona: seco 195 h (≈37.200 bultos), frío 167,5 h (≈36.900) y congelado 255 h (≈38.300).
 * La tarde lleva más frío y congelado porque prepara los cárnicos y vegetales. Sin turno de preparación de noche:
 * las máquinas no toman tareas de noche (`canTakeTask`), así que un presupuesto de noche solo dejaría lotes en cola
 * hasta las 06:00. Reparto a confirmar con la plantilla real.
 */
export const PREPARADORES_POR_TURNO_Y_ZONA: Record<TurnoId, Record<ZonaPreparacion, number>> = {
  'mañana': { dry: 15, cool: 10, frozen: 15 },
  'tarde': { dry: 9, cool: 11, frozen: 17 },
  'noche': { dry: 0, cool: 0, frozen: 0 },
};

/** Productividad confirmada (bultos/h por preparador): seco 200, limpieza y droguería 160, frío 220, congelado 150. */
export const BULTOS_HORA_SECO = 200;
export const BULTOS_HORA_LIMPIEZA = 160;

/**
 * Seco por zona: media de 200 y 160 ponderada por pasillos de seco (el pedido se reparte entre secciones según los
 * pasillos que ocupan). Con 4 pasillos de limpieza y droguería de 17 sale 191. Es una aproximación: la productividad
 * real es por pasillo.
 */
function bultosHoraSeco(): number {
  const pasillos = Object.entries(AISLE_FAMILY_MAP).filter(([id]) => id.startsWith('S-'));
  const limpieza = pasillos.filter(([, familias]) => familias.includes('Limpieza y droguería')).length;
  if (pasillos.length === 0) return BULTOS_HORA_SECO;
  return Math.round((BULTOS_HORA_LIMPIEZA * limpieza + BULTOS_HORA_SECO * (pasillos.length - limpieza)) / pasillos.length);
}

/** Bultos por hora de cada preparador, por zona. Frío y congelado, confirmados; seco, la media de arriba. */
export const BULTOS_HORA: Record<ZonaPreparacion, number> = { dry: bultosHoraSeco(), cool: 220, frozen: 150 };

/** Horas de cada turno: mañana 06:00–14:30, tarde 14:30–22:00. */
const HORAS_TURNO: Record<TurnoId, number> = { 'mañana': 8.5, 'tarde': 7.5, 'noche': 8 };

/** Variación diaria de la productividad (± fracción). */
const VARIACION_PRODUCTIVIDAD = 0.15;

/**
 * Presupuesto de bultos de cada zona en un turno: preparadores presentes en esa zona × bultos por hora × horas del
 * turno, con la variación del día.
 */
export function presupuestoTurno(turno: TurnoId, rnd: () => number): Record<ZonaPreparacion, number> {
  const factor = 1 + (rnd() * 2 - 1) * VARIACION_PRODUCTIVIDAD;
  const zonas: ZonaPreparacion[] = ['dry', 'cool', 'frozen'];
  return Object.fromEntries(
    zonas.map((z) => [z, Math.round(PREPARADORES_POR_TURNO_Y_ZONA[turno][z] * BULTOS_HORA[z] * HORAS_TURNO[turno] * factor)]),
  ) as Record<ZonaPreparacion, number>;
}
