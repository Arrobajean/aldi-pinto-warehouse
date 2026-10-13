/** RNG con estado serializable (contador) para uso dentro del bucle. */
export function nextRandom(state: { rngState: number }): number {
  let a = state.rngState >>> 0;
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = ((t ^ (t >>> 14)) >>> 0);
  return state.rngState / 4294967296;
}
