'use client';

import dynamic from 'next/dynamic';
import { TopBar } from '@/components/top-bar';
import { SidePanel } from '@/components/side-panel';
import { CameraControls } from '@/components/camera-controls';
import { ZoneCard } from '@/components/zone-card';
import { SimControls } from '@/components/sim-controls';
import { DockList } from '@/components/dock-list';
import { EventFeed } from '@/components/event-feed';
import { useWarehouseScene } from '@/hooks/use-warehouse-scene';
import { useSimulation } from '@/hooks/use-simulation';

const Viewport = dynamic(() => import('@/components/viewport').then((m) => m.Viewport), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-muted">Cargando escena 3D…</div>,
});

export function WarehouseApp() {
  const w = useWarehouseScene();
  const sim = useSimulation(w.sceneRef);
  const selected = w.zones.find((z) => z.id === w.selectedZone) ?? null;

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
        />

        <SidePanel
          zones={w.zones}
          layerLabels={w.LAYERS}
          layers={w.layers}
          onFocusZone={(id) => w.acciones.focusZone(id)}
          onToggleLayer={(id) => w.acciones.toggleLayer(id)}
        />

        {selected && <ZoneCard zone={selected} onClose={() => w.acciones.selectZone(null)} />}

        {sim.state && (
          <>
            <DockList state={sim.state} />
            <EventFeed state={sim.state} />
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