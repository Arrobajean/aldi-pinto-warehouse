'use client';

import { memo } from 'react';
import { Layers, Map as MapIcon, Move, Users } from 'lucide-react';
import type { ZoneSummary } from '@/hooks/use-warehouse-scene';
import type { SceneLayerId } from '@/three/warehouse-scene';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SidePanelProps {
  zones: ZoneSummary[];
  layerLabels: { id: SceneLayerId; label: string }[];
  layers: Record<SceneLayerId, boolean>;
  onFocusZone: (zoneId: ZoneSummary['id']) => void;
  onToggleLayer: (id: SceneLayerId) => void;
  onOpenStrappers?: () => void;
  onOpenWorkers?: () => void;
}

export const SidePanel = memo(function SidePanel({
  zones,
  layerLabels,
  layers,
  onFocusZone,
  onToggleLayer,
  onOpenStrappers,
  onOpenWorkers,
}: SidePanelProps) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 top-3 z-30 flex w-64 max-w-[70vw] flex-col gap-3">
      <Card className="pointer-events-auto gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur">
        <CardHeader className="px-3 py-2.5">
          <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <MapIcon className="size-3.5" /> Zonas
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          <ScrollArea className="max-h-[30vh]">
            <div className="grid grid-cols-2 gap-1.5">
              {zones.map((zone) => (
                <Button
                  key={zone.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onFocusZone(zone.id)}
                  className="h-auto justify-start gap-2 px-2.5 py-2 text-xs font-normal"
                  title={`${zone.label} · ${zone.surface.toLocaleString('es-ES')} m²`}
                >
                  <span className="size-2.5 flex-none rounded-[3px]" style={{ background: zone.color }} />
                  <span className="truncate">{zone.label}</span>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="pointer-events-auto gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur">
        <CardHeader className="px-3 py-2.5">
          <CardTitle className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Layers className="size-3.5" /> Capas 3D
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 px-3 pb-3">
          {layerLabels.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13px] transition-colors hover:bg-accent/50"
            >
              <button
                type="button"
                onClick={() => onToggleLayer(layer.id)}
                className="flex-1 cursor-pointer text-left"
              >
                {layer.label}
              </button>
              <Switch
                checked={layers[layer.id]}
                onCheckedChange={() => onToggleLayer(layer.id)}
                aria-label={layer.label}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {onOpenWorkers && (
        <Card className="pointer-events-auto gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur">
          <CardHeader className="px-3 py-2.5">
            <CardTitle className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" /> Trabajadores
              </span>
              <Badge variant="secondary" className="h-5 bg-success/15 px-1.5 font-mono text-[9px] text-success">
                41 activos
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <Button
              variant="outline"
              onClick={onOpenWorkers}
              className="w-full justify-between text-xs font-semibold"
            >
              <span className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-success" />
                Plantilla y Tareas
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">Ver lista &gt;</span>
            </Button>
          </CardContent>
        </Card>
      )}

      {onOpenStrappers && (
        <Card className="pointer-events-auto gap-0 border-border/70 bg-card/90 py-0 shadow-lg backdrop-blur">
          <CardHeader className="px-3 py-2.5">
            <CardTitle className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Move className="size-3.5" /> Flejadoras
              </span>
              <Badge variant="secondary" className="h-5 bg-primary/15 px-1.5 font-mono text-[9px] text-primary">
                FLJ-01/02
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <Button
              variant="outline"
              onClick={onOpenStrappers}
              className="w-full justify-between text-xs font-semibold"
            >
              <span className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-success" />
                Ajustar Posición
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">Mover &gt;</span>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
});
