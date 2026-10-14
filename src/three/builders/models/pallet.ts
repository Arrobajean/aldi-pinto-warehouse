import { boxGeo, part } from './shared';

/** Palé simulado (caja 1,2 × h × 0,8) suelto, útil para montar carga en modelos. */
export function createPallet(height = 1.2, color = 0xa9875b) {
  const pallet = part(boxGeo(1.2, height, 0.8), color, 0, height / 2, 0, true);
  return pallet;
}
