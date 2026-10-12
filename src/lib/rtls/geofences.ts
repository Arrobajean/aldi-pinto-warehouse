import type { RtlsSample, SmoothedTrack } from '@/lib/rtls/types';
import type { WarehouseLayout } from '@/lib/layout/types';
import type { ZoneId } from '@/lib/types';

export type GeofenceAlertType = 'speed' | 'frozen_exposure' | 'proximity' | 'idle_outside' | 'pedestrian_machine';

export interface GeofenceAlert {
  id: string;
  ts: number;
  tagId: string;
  type: GeofenceAlertType;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  x: number;
  z: number;
}

const ZONE_SPEED_LIMIT: Record<string, number> = {
  seco: 2.1,
  frio: 1.8,
  congelado: 1.8,
  fyv: 1.5,
  expedicion: 2.6,
};

interface RuleState {
  lastEmit: Record<string, number>;
  frozenSince: Record<string, number>;
  idleSince: Record<string, number>;
}

function newRuleState(): RuleState {
  return { lastEmit: {}, frozenSince: {}, idleSince: {} };
}

export class Geofences {
  private rules = newRuleState();
  private alertSeq = 0;

  constructor(private layout: WarehouseLayout) {}

  private throttle(key: string, now: number, everySec: number): boolean {
    const last = this.rules.lastEmit[key] ?? -Infinity;
    if (now - last < everySec) return false;
    this.rules.lastEmit[key] = now;
    return true;
  }

  private emit(type: GeofenceAlertType, severity: GeofenceAlert['severity'], ts: number, tagId: string, message: string, x: number, z: number): GeofenceAlert {
    return {
      id: `GEO-${String(++this.alertSeq).padStart(4, '0')}`,
      ts,
      tagId,
      type,
      severity,
      message,
      x,
      z,
    };
  }

  zoneAt(x: number, z: number): ZoneId | null {
    for (const zone of this.layout.zones) {
      if (x >= zone.rect.xMin && x <= zone.rect.xMax && z >= zone.rect.zMin && z <= zone.rect.zMax) {
        return zone.id;
      }
    }
    return null;
  }

  private inChargeZone(x: number, z: number): boolean {
    const charge = this.layout.zones.find((z) => z.id === 'carga_baterias');
    return charge ? x >= charge.rect.xMin && x <= charge.rect.xMax && z >= charge.rect.zMin && z <= charge.rect.zMax : false;
  }

  /** Evalúa todas las reglas para las muestras nuevas. Devuelve las alertas nuevas. */
  evaluate(samples: RtlsSample[], tracks: Map<string, SmoothedTrack>): GeofenceAlert[] {
    const alerts: GeofenceAlert[] = [];

    for (const sample of samples) {
      const track = tracks.get(sample.tagId);
      if (!track) continue;
      const now = sample.ts;
      const zone = this.zoneAt(sample.x, sample.z);

      // Velocidad máxima por zona.
      if (zone && ZONE_SPEED_LIMIT[zone] !== undefined && track.speed > ZONE_SPEED_LIMIT[zone]) {
        if (this.throttle(`spd:${sample.tagId}:${zone}`, now, 25)) {
          alerts.push(
            this.emit('speed', 'warning', now, sample.tagId, `${sample.tagId} a ${track.speed.toFixed(1)} m/s (límite ${ZONE_SPEED_LIMIT[zone]} en ${zone})`, sample.x, sample.z),
          );
        }
      }

      // Tiempo máximo seguido en congelado (PRL del operario).
      if (zone === 'congelado') {
        if (!(sample.tagId in this.rules.frozenSince)) this.rules.frozenSince[sample.tagId] = now;
        const elapsed = now - (this.rules.frozenSince[sample.tagId] ?? now);
        if (elapsed > 45 * 60 && this.throttle(`frozen:${sample.tagId}`, now, 300)) {
          alerts.push(
            this.emit('frozen_exposure', 'critical', now, sample.tagId, `${sample.tagId}: operario ${Math.floor(elapsed / 60)} min en congelado (máx. 45)`, sample.x, sample.z),
          );
        }
      } else if (sample.tagId in this.rules.frozenSince) {
        delete this.rules.frozenSince[sample.tagId];
        this.throttle(`frozen:${sample.tagId}`, now, 1);
      }

      // Máquina parada fuera de zona de carga durante demasiado tiempo.
      if (track.speed < 0.05 && !this.inChargeZone(sample.x, sample.z)) {
        if (!(sample.tagId in this.rules.idleSince)) this.rules.idleSince[sample.tagId] = now;
        const idle = now - (this.rules.idleSince[sample.tagId] ?? now);
        if (idle > 150 && this.throttle(`idle:${sample.tagId}`, now, 120)) {
          alerts.push(this.emit('idle_outside', 'info', now, sample.tagId, `${sample.tagId} parada ${Math.floor(idle / 60)} min fuera de la zona de carga`, sample.x, sample.z));
        }
      } else if (sample.tagId in this.rules.idleSince) {
        delete this.rules.idleSince[sample.tagId];
      }
    }

    // Proximidad entre dos máquinas < 2 m.
    const list = [...tracks.values()].filter((t) => t.samples.length >= 2);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.tagId === b.tagId) continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < 2) {
          const key = `prox:${a.tagId}:${b.tagId}`;
          if (this.throttle(key, a.lastTs, 30)) {
            alerts.push(
              this.emit('proximity', 'critical', a.lastTs, a.tagId, `Proximidad < 2 m entre ${a.tagId} y ${b.tagId}`, (a.x + b.x) / 2, (a.z + b.z) / 2),
            );
          }
        }
      }
    }

    return alerts;
  }
}