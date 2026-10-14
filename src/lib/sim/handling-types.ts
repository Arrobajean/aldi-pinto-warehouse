/** Tipos de la manipulación de palés: poses, paradas, maniobras y planes de tiempo. (extraído de handling.ts) */

import type { Machine } from '@/lib/sim/types';

export interface PalletPose {
  x: number;
  /** Cota de la cara inferior sobre el piso del lugar (0 = suelo). */
  y: number;
  z: number;
  rotY: number;
}

export type StopWhere = 'rack' | 'floor' | 'trailer' | 'strapper';

/** Una maniobra de coger o dejar 1 o 2 palés en un puesto. */
export interface Stop {
  /** Puesto de la máquina (origen del modelo). */
  x: number;
  z: number;
  kind: 'take' | 'put';
  /** Palés que cambian de manos (el primero ocupa la posición trasera de las horquillas). */
  paletIds: string[];
  where: StopWhere;
  /** Cota de la cara inferior del palé en su sitio (m sobre el piso). */
  height: number;
  /** Rumbo que mantiene la máquina durante la maniobra (0 = +Z, π/2 = +X). */
  face: number;
  /** Distancia del puesto al centro del primer palé, en la dirección de `face` (m). */
  depth: number;
  /** Pose del primer palé en su sitio; el segundo va 1,2 m más allá en la dirección de `face`. */
  place: PalletPose;
}

/** Maniobra en curso. */
export interface Handling {
  stop: Stop;
  /** La máquina ya llevaba palés al empezar (cambia la altura de partida de las horquillas). */
  laden: boolean;
  elapsed: number;
  total: number;
}

/**
 * Máquina con el estado de manipulación. Los tres campos son opcionales: sin `stops` la máquina se comporta como
 * antes (sin maniobras de coger/dejar). Cuando `Machine` los declare, este tipo es equivalente a él.
 */
export type HandlingMachine = Machine & { stops?: Stop[]; handling?: Handling; dropped?: Dropped[] };

/** Palé ya dejado en su sitio durante la tarea en curso (se dibuja ahí hasta que la tarea termina). */
export interface Dropped {
  paletId: string;
  pose: PalletPose;
}

export interface PlanKey {
  t: number;
  /** Elevación de las horquillas sobre su cota de reposo. */
  lift: number;
  /** Avance: alcance del carro (retráctil) o desplazamiento del vehículo (resto) en la dirección de `face`. */
  ext: number;
}

export interface HandlingPlan {
  keys: PlanKey[];
  /** Instante en que el palé cambia de manos (se despega o se apoya). */
  transferT: number;
  total: number;
  /** Avance máximo (m). */
  maxExt: number;
}

export interface HandlingPose {
  lift: number;
  ext: number;
  /** El palé ya ha cambiado de manos. */
  transferred: boolean;
}
