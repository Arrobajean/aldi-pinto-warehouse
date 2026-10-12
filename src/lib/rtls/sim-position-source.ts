import type { RtlsSample } from '@/lib/rtls/types';

function gaussian(rng: () => number, sigma = 0.3) {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export type EntityPosGetter = (tagId: string) => { x: number; z: number } | null;

/**
 * Fuente simulada: toma la posición de la simulación y le añade ruido
 * gaussiano de ~0,3 m cada 1 s, como un UWB real.
 */
export class SimPositionSource {
  readonly kind = 'sim';

  private intervalId: number | null = null;
  private rng: () => number;
  private intervalSec = 1;

  constructor(
    private getPos: EntityPosGetter,
    private getTags: () => string[],
    private now: () => number,
    seed = 20230302,
  ) {
    let a = seed >>> 0;
    this.rng = () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  subscribe(cb: (sample: RtlsSample) => void): () => void {
    const tick = () => {
      const ts = this.now();
      for (const tagId of this.getTags()) {
        const pos = this.getPos(tagId);
        if (!pos) continue;
        const sample: RtlsSample = {
          tagId,
          x: pos.x + gaussian(this.rng),
          z: pos.z + gaussian(this.rng),
          floorLevel: 0,
          ts,
          accuracy: 0.3,
        };
        cb(sample);
      }
    };
    tick();
    this.intervalId = window.setInterval(tick, this.intervalSec * 1000);
    return () => {
      if (this.intervalId !== null) window.clearInterval(this.intervalId);
    };
  }
}