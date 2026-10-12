import type { PositionSource, RtlsSample } from '@/lib/rtls/types';

/**
 * Fuente preparada para balizas reales (WebSocket o MQTT). El backend no está
 * implementado todavía; F16 añadirá el conector completo con un mapeo tagId → máquina.
 */
export class WebSocketPositionSource implements PositionSource {
  readonly kind = 'websocket';
  private url: string;
  private ws: WebSocket | null = null;
  private cb: ((sample: RtlsSample) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  subscribe(cb: (sample: RtlsSample) => void): () => void {
    this.cb = cb;
    this.connect();
    return () => {
      this.cb = null;
      this.ws?.close();
      this.ws = null;
    };
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onmessage = (event) => {
        if (!this.cb) return;
        try {
          const raw = JSON.parse(event.data as string) as Partial<RtlsSample>;
          if (typeof raw.tagId === 'string' && typeof raw.x === 'number' && typeof raw.z === 'number') {
            this.cb({
              tagId: raw.tagId,
              x: raw.x,
              z: raw.z,
              floorLevel: raw.floorLevel ?? 0,
              ts: raw.ts ?? 0,
              accuracy: raw.accuracy ?? 0.5,
            });
          }
        } catch {
          // mensaje ignorado
        }
      };
    } catch {
      this.ws = null;
    }
  }
}