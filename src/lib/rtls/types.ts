/** Fuente de localización RTLS (UWB/BLE). F16 la sustituye por conectores reales. */
export interface RtlsSample {
  tagId: string;
  x: number;
  z: number;
  floorLevel: number;
  /** timestamp de simulación (s) en que se capturó. */
  ts: number;
  accuracy: number;
}

export interface PositionSource {
  readonly kind: string;
  /** Se llama al recibir cada muestra. */
  subscribe(cb: (sample: RtlsSample) => void): () => void;
}

/** Filtro de suavizado y reconciliación (media móvil exponencial por tag). */
export interface SmoothedTrack {
  tagId: string;
  x: number;
  z: number;
  /** velocidad derivada (m/s) entre muestras filtradas. */
  speed: number;
  lastTs: number;
  samples: RtlsSample[];
}