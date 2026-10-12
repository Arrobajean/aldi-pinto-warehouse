'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { WarehouseScene } from '@/three/warehouse-scene';
import { SimPositionSource } from '@/lib/rtls/sim-position-source';
import { RtlsFilter } from '@/lib/rtls/rtls-filter';
import { Geofences, type GeofenceAlert } from '@/lib/rtls/geofences';
import type { RtlsSample, SmoothedTrack } from '@/lib/rtls/types';

export interface EntityHit {
  kind: 'machine' | 'truck';
  id: string;
}

export function useRtls(sceneRef: MutableRefObject<WarehouseScene | null>, labelRef: MutableRefObject<HTMLDivElement | null>) {
  const [tracks, setTracks] = useState<Map<string, SmoothedTrack>>(new Map());
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);
  const [selected, setSelected] = useState<EntityHit | null>(null);
  const [hover, setHover] = useState<EntityHit | null>(null);
  const [ready, setReady] = useState(false);

  const filterRef = useRef<RtlsFilter | null>(null);
  const sampleBufRef = useRef<RtlsSample[]>([]);

  // Inicializa la fuente RTLS cuando la escena está lista.
  useEffect(() => {
    const boot = setInterval(() => {
      const scene = sceneRef.current;
      if (!scene) return;
      clearInterval(boot);
      const layout = scene.layout;
      const filter = new RtlsFilter();
      const geofences = new Geofences(layout);
      filterRef.current = filter;

      const nowFromSim = () => scene.getLastState()?.ts ?? 0;
      const source = new SimPositionSource(
        (tagId) => {
          const s = scene.getLastState();
          if (!s) return null;
          const m = s.machines.find((x) => x.id === tagId);
          if (m) return { x: m.pos.x, z: m.pos.z };
          const t = s.trucks.find((x) => x.id === tagId);
          return t ? { x: t.pos.x, z: t.pos.z } : null;
        },
        () => {
          const s = scene.getLastState();
          if (!s) return [];
          return [...s.machines.map((m) => m.id), ...s.trucks.map((t) => t.id)];
        },
        nowFromSim,
      );

      const unsub = source.subscribe((sample) => {
        filter.accept(sample);
        if (Math.abs(nowFromSim() - sample.ts) < 2) sampleBufRef.current.push(sample);
      });

      const tick = setInterval(() => {
        const s = scene.getLastState();
        if (!s) return;
        const batch = sampleBufRef.current;
        sampleBufRef.current = [];
        scene.updateRtls(s.ts, filter.tracks);
        const fresh = batch.length ? geofences.evaluate(batch, filter.tracks) : [];
        if (fresh.length) setAlerts((prev) => [...fresh, ...prev].slice(0, 120));
        setTracks(new Map(filter.tracks));
      }, 1000);

      setReady(true);
      return () => {
        unsub();
        clearInterval(tick);
      };
    }, 200);
    return () => clearInterval(boot);
  }, [sceneRef]);

  // Etiqueta flotante: un bucle posiciona el div sobre la máquina mientras hay hover.
  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    const id = hover?.id;
    if (!id) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    let raf = 0;
    const frame = () => {
      const scene = sceneRef.current;
      const s = scene?.getLastState();
      const entity = s ? s.machines.find((m) => m.id === id) ?? s.trucks.find((t) => t.id === id) : null;
      if (scene && entity) {
        const p = scene.projectToScreen(entity.pos.x, entity.pos.z);
        if (p) {
          el.style.left = `${Math.round(p.x)}px`;
          el.style.top = `${Math.max(60, Math.round(p.y - 26))}px`;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hover, labelRef, sceneRef]);

  return {
    ready,
    tracks,
    alerts,
    selected,
    hover,
    setSelected,
    setHover,
  };
}