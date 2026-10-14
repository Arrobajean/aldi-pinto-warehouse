/** Constantes de las máquinas y los palés en la manipulación: capacidades, medidas, elevaciones y alturas. (extraído de handling.ts) */

import type { MachineKind } from '@/lib/sim/types';

/** Palés que caben a la vez en las horquillas de cada máquina. */
export const MAX_ON_FORKS: Record<MachineKind, number> = { retractil: 1, frontal: 2, recogepedidos: 2, transpaleta: 3 };

/** Medidas del europalé (m). */
export const PALLET_LEN = 1.2;
export const PALLET_WID = 0.8;

/** Cota de la cara inferior de las puntas de horquilla en reposo (m sobre el piso). */
export const FORK_REST = 0.03;
/** Distancia del origen de la máquina al centro del palé más cercano al respaldo cuando va recogido (m). */
export const CARRY_CENTER: Record<MachineKind, number> = { retractil: 0.35, frontal: 1.2, recogepedidos: 1.2, transpaleta: 1.2 };
/** Recorrido máximo del carro de la retráctil (m). */
export const REACH_MAX = 1.35;
/** Elevación de las horquillas al transportar un palé (m). */
export const CARRY_LIFT = 0.12;
/** Elevación extra para despegar o apoyar un palé (m). */
export const TRANSFER_LIFT = 0.1;
/** Elevación mínima con un palé cargado sobre el suelo (para que no se hunda). */
export const FLOOR_LIFT = 0.035;
/** Metros que se mete el vehículo bajo un palé del suelo (recoger o dejar). */
export const FLOOR_APPROACH = 0.9;
/** Palés por semirremolque y filas: 3 de frente × 11 filas = 33 europalés. */
export const TRAILER_ROWS = 11;
export const TRAILER_COLS = 3;

/** Cota de la cara superior de los rodillos de la flejadora (m sobre el piso). */
export const STRAPPER_BELT_H = 0.62;
