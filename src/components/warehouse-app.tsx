'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { WarehouseView } from '@/components/views/warehouse-view';
import { AssistantView } from '@/components/views/assistant-view';
import { ProfileView, type ProfileMetrics } from '@/components/views/profile-view';
import { CURRENT_USER } from '@/data/current-user';
import { useWarehouseScene } from '@/hooks/use-warehouse-scene';
import { useSimulation } from '@/hooks/use-simulation';
import { useRtls } from '@/hooks/use-rtls';
import { useStock } from '@/hooks/use-stock';
import { useAssistant, defaultActions } from '@/hooks/use-assistant';
import { formatSimTime } from '@/lib/sim/clock';
import type { AppView } from '@/lib/app-view';
import type { ZoneId } from '@/lib/types';

export function WarehouseApp() {
  const w = useWarehouseScene();
  const sim = useSimulation(w.sceneRef);
  const labelRef = useRef<HTMLDivElement | null>(null);
  const rtls = useRtls(w.sceneRef, labelRef);
  const stock = useStock(w.sceneRef, sim.state);

  const [view, setView] = useState<AppView>('warehouse');
  const [followingId, setFollowingId] = useState<string | null>(null);
  const [strappersOpen, setStrappersOpen] = useState(false);
  const [workersOpen, setWorkersOpen] = useState(false);

  const getSimSnapshot = useCallback(() => sim.state, [sim.state]);
  const assistantActions = useMemo(() => defaultActions(w.sceneRef), [w.sceneRef]);
  const assistant = useAssistant(getSimSnapshot, assistantActions);

  const handleFollow = (id: string, follow: boolean) => {
    w.sceneRef.current?.followEntity(follow ? id : null);
    setFollowingId(follow ? id : null);
  };

  const handleSelectWorker = (machineId: string) => {
    rtls.setSelected({ kind: 'machine', id: machineId });
    handleFollow(machineId, true);
    setView('warehouse');
  };

  const handleSelectZone = (zoneId: ZoneId) => {
    w.acciones.focusZone(zoneId);
    setView('warehouse');
  };

  const metrics = useMemo<ProfileMetrics>(
    () => ({
      locations: w.stats.locations,
      zones: w.zones.length,
      dockCount: w.stats.dockCount,
      aisles: w.stats.aisleCount,
      machines: sim.state?.machines.length ?? 0,
      tasks: sim.state?.tasks.length ?? 0,
      activeDocks: sim.state ? sim.state.dockStates.filter((d) => d.truckId).length : 0,
    }),
    [w.stats, w.zones, sim.state],
  );

  const indicadores = useMemo(
    () => [
      { label: 'Nave', value: '50.895 m²' },
      { label: 'Ubicaciones', value: w.stats.locations.toLocaleString('es-ES') },
      {
        label: 'Muelles',
        value: sim.state
          ? `${w.stats.dockCount} · ${sim.state.dockStates.filter((d) => d.truckId).length} oc.`
          : String(w.stats.dockCount),
      },
      {
        label: 'Hora sim.',
        value: sim.state ? `${formatSimTime(sim.state.ts)} · ${sim.state.shiftId}` : '--:--:--',
      },
    ],
    [sim.state, w.stats],
  );

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar view={view} onViewChange={setView} zones={w.zones} onSelectZone={handleSelectZone} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <AppHeader
          view={view}
          indicators={indicadores}
          simTs={sim.state?.ts ?? null}
          shiftId={sim.state?.shiftId ?? null}
          running={sim.running}
          onViewChange={setView}
        />

        {view === 'warehouse' && (
          <WarehouseView
            w={w}
            sim={sim}
            rtls={rtls}
            stock={stock}
            labelRef={labelRef}
            followingId={followingId}
            onFollow={handleFollow}
            onSelectWorker={handleSelectWorker}
            strappersOpen={strappersOpen}
            onToggleStrappers={() => setStrappersOpen((v) => !v)}
            onCloseStrappers={() => setStrappersOpen(false)}
            workersOpen={workersOpen}
            onToggleWorkers={() => setWorkersOpen((v) => !v)}
            onCloseWorkers={() => setWorkersOpen(false)}
          />
        )}

        {view === 'assistant' && (
          <AssistantView messages={assistant.messages} loading={assistant.loading} onSend={assistant.send} />
        )}

        {view === 'profile' && <ProfileView user={CURRENT_USER} metrics={metrics} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
