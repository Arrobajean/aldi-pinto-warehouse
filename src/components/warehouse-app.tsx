'use client';

import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { TopBar } from '@/components/top-bar';
import { SidePanel } from '@/components/side-panel';
import { CameraControls } from '@/components/camera-controls';
import { ZoneCard } from '@/components/zone-card';
import { SimControls } from '@/components/sim-controls';
import { DockList } from '@/components/dock-list';
import { EventFeed } from '@/components/event-feed';
import { useWarehouseScene } from '@/hooks/use-warehouse-scene';
import { useSimulation } from '@/hooks/use-simulation';
import { useRtls } from '@/hooks/use-rtls';
import { useStock } from '@/hooks/use-stock';
import { MachineCard } from '@/components/machine-card';
import { EntityLabel } from '@/components/entity-label';
import { StockPanel } from '@/components/stock-panel';

const Viewport = dynamic(() => import('@/components/viewport').then((m) => m.Viewport), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted">Cargando escena 3D…</div>,
});

export function WarehouseApp() {
  const w = useWarehouseScene();
  const sim = useSimulation(w.sceneRef);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const rtls = useRtls(w.sceneRef, labelRef);
  const stock = useStock(w.sceneRef, sim.state);
  const [followingId, setFollowingId] = useState<string | null>(null);
  const selected = w.zones.find((z) => z.id === w.selectedZone) ?? null;

  const handleFollow = (id: string, follow: boolean) => {
    w.sceneRef.current?.followEntity(follow ? id : null);
    setFollowingId(follow ? id : null);
  };

  const indicadores = [
    { label: 'Nave', value: '40.000 m²' },
    { label: 'Ubicaciones', value: w.stats.locations.toLocaleString('es-ES') },
    {
      label: 'Muelles',
      value: sim.state ? `${w.stats.dockCount} · ${sim.state.dockStates.filter((d) => d.truckId).length} oc.` : String(w.stats.dockCount),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <TopBar indicators={indicadores} />

      <main className="relative min-h-0 flex-1 overflow-hidden bg-bg">
        <Viewport
          sceneRef={w.sceneRef}
          layers={w.layers}
          wallMode={w.wallMode}
          onSelect={(zoneId) => w.acciones.selectZone(zoneId)}
          onHoverZone={() => {}}
          onSelectEntity={(kind, id) => rtls.setSelected({ kind, id })}
          onHoverEntity={(kind, id) => rtls.setHover(kind === 'machine' || kind === 'truck' ? { kind, id } : null)}
          onSelectStock={(selection) => stock.setSelection(selection)}
        />

        <SidePanel
          zones={w.zones}
          layerLabels={w.LAYERS}
          layers={w.layers}
          onFocusZone={(id) => w.acciones.focusZone(id)}
          onToggleLayer={(id) => w.acciones.toggleLayer(id)}
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
            onFollow={handleFollow}
            onClose={() => rtls.setSelected(null)}
          />
        ) : (
          selected && sim.state && <ZoneCard zone={selected} onClose={() => w.acciones.selectZone(null)} />
        )}

        {rtls.hover && sim.state && (
          <div
            ref={labelRef}
            className="absolute z-40 -translate-x-1/2"
            style={{ display: 'none' }}
          >
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
          zoomLevel={w.zoomLevel}
          onRotate={(dir) => w.acciones.rotate(dir)}
          onZoom={(level) => w.acciones.setZoom(level)}
          onWallMode={() => w.acciones.cycleWallMode()}
          onReset={() => w.acciones.focusGeneral()}
        />
      </main>

      <footer className="flex items-center gap-4 border-t border-line bg-panel px-4 py-1.5 text-[11px] text-muted">
        <span>
          Plataforma logística de <strong className="font-semibold text-fg">ALDI en Pinto</strong> — 8 provincias servidas
        </span>
        <span>Datos simulados con fines de demostración</span>
      </footer>
    </div>
  );
}