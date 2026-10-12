import type { RtlsSample, SmoothedTrack } from '@/lib/rtls/types';

const ALPHA = 0.6;
const TRAIL_CAP = 160;

/**
 * Suaviza el ruido del UWB con una media móvil exponencial por tag y deriva
 * la velocidad aparente. Alimenta capas y geocercas.
 */
export class RtlsFilter {
  tracks = new Map<string, SmoothedTrack>();

  accept(sample: RtlsSample): SmoothedTrack {
    let track = this.tracks.get(sample.tagId);
    if (!track) {
      track = {
        tagId: sample.tagId,
        x: sample.x,
        z: sample.z,
        speed: 0,
        lastTs: sample.ts,
        samples: [sample],
      };
      this.tracks.set(sample.tagId, track);
      return track;
    }

    const dt = Math.max(sample.ts - track.lastTs, 0.1);
    const prevX = track.x;
    const prevZ = track.z;
    track.x = ALPHA * sample.x + (1 - ALPHA) * prevX;
    track.z = ALPHA * sample.z + (1 - ALPHA) * prevZ;
    const dist = Math.hypot(track.x - prevX, track.z - prevZ);
    track.speed = dist / dt;
    track.lastTs = sample.ts;
    track.samples.push(sample);
    if (track.samples.length > TRAIL_CAP) track.samples.splice(0, track.samples.length - TRAIL_CAP);
    return track;
  }

  clear() {
    this.tracks.clear();
  }
}