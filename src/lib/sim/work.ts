/** Generación de trabajo en cada paso: ubicaciones, reposiciones, picking, transferencias y consolidación. (extraído de tick.ts) */

import type { SimDeps } from '@/lib/sim/deps';
import type { SimState } from '@/lib/sim/types';
import { generateConsolidation } from '@/lib/sim/work-consolidation';
import { generatePicking } from '@/lib/sim/work-picking';
import { generatePutaway, generateReplenish } from '@/lib/sim/work-storage';
import { generateTransfers } from '@/lib/sim/work-transfer';

/** Genera pedidos (pick), reposiciones y putaway usando los índices incrementales. */
export function generateWork(state: SimState, deps: SimDeps) {
  // El orden de las fases importa: comparten el estado y el generador aleatorio.
  generatePutaway(state, deps);
  generatePicking(state, deps);
  generateTransfers(state, deps);
  generateConsolidation(state, deps);
  generateReplenish(state);
}
