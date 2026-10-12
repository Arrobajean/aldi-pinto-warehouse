'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ZoneId } from '@/lib/types';
import { WarehouseScene, type SceneLayerId } from '@/three/warehouse-scene';
import type { WallMode } from '@/three/wall-modes';

interface ViewportProps {
  sceneRef: MutableRefObject<WarehouseScene | null>;
  layers: Record<SceneLayerId, boolean>;
  wallMode: WallMode;
  onSelect: (zoneId: ZoneId | null) => void;
  onHoverZone: (zoneId: ZoneId | null) => void;
}

/** Monta la escena three. Se carga con next/dynamic(ssr:false) desde el contenedor. */
export function Viewport({ sceneRef, layers, wallMode, onSelect, onHoverZone }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onHoverZone });

  useEffect(() => {
    callbacks.current = { onSelect, onHoverZone };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new WarehouseScene(container, {
      onSelect: (zoneId) => callbacks.current.onSelect(zoneId),
      onHoverZone: (zoneId) => callbacks.current.onHoverZone(zoneId),
    });
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [sceneRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setLayers(layers);
    scene.setWallMode(wallMode);
  }, [layers, wallMode, sceneRef]);

  return <div ref={containerRef} className="absolute inset-0" />;
}