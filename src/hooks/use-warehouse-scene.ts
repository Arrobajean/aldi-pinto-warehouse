'use client';

import { useMemo, useRef, useState } from 'react';
import type { ZoneId } from '@/lib/types';
import { buildPintoLayout, forEachRackSlot } from '@/lib/layout/pinto-layout';
import { rectArea, type ZoneInfo } from '@/lib/layout/types';
import type { WarehouseScene, SceneLayerId } from '@/three/warehouse-scene';
import type { WallMode } from '@/three/wall-modes';
import type { SimsZoomLevel } from '@/three/sims-camera';

export interface LayerToggle {
  id: SceneLayerId;
  label: string;
}

const LAYERS: LayerToggle[] = [
  { id: 'racks', label: 'Estanterías' },
  { id: 'pallets', label: 'Palets' },
  { id: 'labels', label: 'Rótulos' },
  { id: 'machines', label: 'Máquinas' },
  { id: 'trucks', label: 'Camiones' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'shadows', label: 'Sombras' },
];

const DEFAULT_LAYERS: Record<SceneLayerId, boolean> = {
  racks: true,
  pallets: true,
  labels: true,
  machines: true,
  trucks: true,
  exterior: true,
  shadows: true,
};

export interface ZoneSummary extends ZoneInfo {
  surface: number;
  locations: number;
  aisles: number;
  occupancy: number;
}

export function useWarehouseScene() {
  const sceneRef = useRef<WarehouseScene | null>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(null);
  const [layers, setLayersState] = useState(DEFAULT_LAYERS);
  const [wallMode, setWallModeState] = useState<WallMode>('cut');
  const [zoomLevel, setZoomLevelState] = useState<SimsZoomLevel>(3);

  const layout = useMemo(() => buildPintoLayout(), []);

  const zones = useMemo(() => {
    const counts: Record<string, number> = {};
    forEachRackSlot(layout, (slot) => {
      counts[slot.zoneId] = (counts[slot.zoneId] ?? 0) + 1;
    });
    return layout.zones.map<ZoneSummary>((zone) => {
      const rackZone = layout.zones.find((z) => z.id === zone.id);
      const aisles = layout.aisles.filter((a) => a.zoneId === zone.id).length;
      const locations = counts[zone.id] ?? 0;
      return {
        ...zone,
        rackSegments: rackZone?.rackSegments,
        surface: Math.round(rectArea(zone.rect)),
        locations,
        aisles,
        occupancy: Math.round((locations || 0) * 0.85),
      };
    });
  }, [layout]);

  const acciones = useMemo(
    () => ({
      rotate(dir: 1 | -1) {
        sceneRef.current?.rotate(dir);
      },
      setZoom(level: SimsZoomLevel) {
        sceneRef.current?.setZoomLevel(level);
        setZoomLevelState(level);
      },
      focusZone(zoneId: ZoneId) {
        sceneRef.current?.focusZone(zoneId);
        setSelectedZone(zoneId);
      },
      focusGeneral() {
        sceneRef.current?.focusGeneral();
        setSelectedZone(null);
      },
      setWallMode(mode: WallMode) {
        sceneRef.current?.setWallMode(mode);
        setWallModeState(mode);
      },
      cycleWallMode() {
        const next: WallMode = wallMode === 'up' ? 'cut' : wallMode === 'cut' ? 'down' : 'up';
        acciones.setWallMode(next);
      },
      toggleLayer(id: SceneLayerId) {
        setLayersState((prev) => {
          const next = { ...prev, [id]: !prev[id] };
          sceneRef.current?.setLayer(id, next[id]);
          return next;
        });
      },
      selectZone(zoneId: ZoneId | null) {
        setSelectedZone(zoneId);
      },
    }),
    [wallMode],
  );

  return {
    sceneRef,
    layout,
    zones,
    layers,
    LAYERS,
    wallMode,
    zoomLevel,
    selectedZone,
    acciones,
    stats: layout.stats,
  };
}