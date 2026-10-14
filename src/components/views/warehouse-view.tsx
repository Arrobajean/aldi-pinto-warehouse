'use client';

import dynamic from 'next/dynamic';
import { useCallback, type MutableRefObject } from 'react';
import { SidePanel } from '@/components/side-panel';
import { CameraControls } from '@/components/camera-controls';
import { ZoneCard } from '@/components/zone-card';
import { SimControls } from '@/components/sim-controls';
import { DockList } from '@/components/dock-list';
import { EventFeed } from '@/components/event-feed';
import { MachineCard } from '@/components/machine-card';
import { EntityLabel } from '@/components/entity-label';
import { StockPanel } from '@/components/stock-panel';
import { StrapperControls } from '@/components/strapper-controls';
import { WorkersPanel } from '@/components/workers-panel';
import type { useWarehouseScene } from '@/hooks/use-warehouse-scene';
import type { useSimulation } from '@/hooks/use-simulation';
import type { useRtls } from '@/hooks/use-rtls';
import type { useStock } from '@/hooks/use-stock';

const Viewport = dynamic(() => import('@/components/viewport').then((m) => m.Viewport), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted-foreground">Cargando escena 3D…</div>,
});

interface WarehouseViewProps {
  w: ReturnType<typeof useWarehouseScene>;
  sim: ReturnType<typeof useSimulation>;
  rtls: ReturnType<typeof useRtls>;
  stock: ReturnType<typeof useStock>;
  labelRef: MutableRefObject<HTMLDivElement | null>;
  followingId: string | null;
  onFollow: (id: string, follow: boolean) => void;
  onSelectWorker: (machineId: string) => void;
  strappersOpen: boolean;
  onToggleStrappers: () => void;
  onCloseStrappers: () => void;
  workersOpen: boolean;
  onToggleWorkers: () => void;
  onCloseWorkers: () => void;
}

export function WarehouseView({
  w,
  sim,
  rtls,
  stock,
  labelRef,
  followingId,
  onFollow,
  onSelectWorker,
  strappersOpen,
  onToggleStrappers,
  onCloseStrappers,
  workersOpen,
  onToggleWorkers,
  onCloseWorkers,
}: WarehouseViewProps) {
  const selected = w.zones.find((z) => z.id === w.selectedZone) ?? null;

  const handleHoverEntity = useCallback(
    (kind: 'machine' | 'truck', id: string) => {
      rtls.setHover(kind === 'machine' || kind === 'truck' ? { kind, id } : null);
    },
    [rtls],
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <Viewport
        sceneRef={w.sceneRef}
        layers={w.layers}
        wallMode={w.wallMode}
        onSelect={w.acciones.selectZone}
        onHoverZone={() => {}}
        onSelectEntity={(kind, id) => rtls.setSelected({ kind, id })}
        onHoverEntity={handleHoverEntity}
        onSelectStock={stock.setSelection}
      />

      <SidePanel
        zones={w.zones}
        layerLabels={w.LAYERS}
        layers={w.layers}
        onFocusZone={w.acciones.focusZone}
        onToggleLayer={w.acciones.toggleLayer}
        onOpenStrappers={() => onToggleStrappers()}
        onOpenWorkers={() => onToggleWorkers()}
      />

      <StockPanel
        mode={stock.mode}
        onMode={stock.setMode}
        query={stock.query}
        onQuery={stock.setQuery}
        onSearch={stock.search}
        selection={stock.selection}
        onCloseSelection={() => stock.setSelection(null)}
        alerts={stock.alerts}
      />

      {rtls.selected && sim.state ? (
        <MachineCard
          state={sim.state}
          entity={rtls.selected}
          alerts={rtls.alerts}
          following={rtls.selected.id === followingId}
          onFollow={onFollow}
          onClose={() => rtls.setSelected(null)}
        />
      ) : (
        selected && sim.state && <ZoneCard zone={selected} onClose={() => w.acciones.selectZone(null)} />
      )}

      {rtls.hover && sim.state && (
        <div ref={labelRef} className="absolute z-40 -translate-x-1/2" style={{ display: 'none' }}>
          <EntityLabel hover={rtls.hover} state={sim.state} following={rtls.hover.id === followingId} />
        </div>
      )}

      {sim.state && (
        <>
          <DockList state={sim.state} />
          <EventFeed state={sim.state} rtlsAlerts={rtls.alerts} />
        </>
      )}

      <SimControls
        state={sim.state}
        speed={sim.speed}
        running={sim.running}
        onPlay={sim.acciones.play}
        onPause={sim.acciones.pause}
        onSpeed={sim.acciones.setSpeed}
        onRestart={sim.acciones.restart}
      />

      <CameraControls
        sceneRef={w.sceneRef}
        zoomLevel={w.zoomLevel}
        wallMode={w.wallMode}
        onRotate={w.acciones.rotate}
        onLookTowards={w.acciones.lookTowards}
        onZoom={w.acciones.setZoom}
        onWallMode={w.acciones.cycleWallMode}
        onReset={w.acciones.focusGeneral}
      />

      <StrapperControls
        open={strappersOpen}
        onClose={onCloseStrappers}
        sceneRef={w.sceneRef}
        onUpdateStrapper={(id, x, z) => {
          w.acciones.setStrapperPosition(id, x, z);
          sim.acciones.updateStrapper(id, x, z);
        }}
      />

      {sim.state && (
        <WorkersPanel
          open={workersOpen}
          onClose={onCloseWorkers}
          state={sim.state}
          onSelectWorker={onSelectWorker}
        />
      )}
    </div>
  );
}
