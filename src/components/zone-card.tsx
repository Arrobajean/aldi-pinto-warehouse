'use client';

import { memo } from 'react';
import { X } from 'lucide-react';
import type { ZoneSummary } from '@/hooks/use-warehouse-scene';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ZoneCardProps {
  zone: ZoneSummary;
  onClose: () => void;
}

function ZoneCardBase({ zone, onClose }: ZoneCardProps) {
  return (
    <Card className="absolute right-3 top-3 z-30 w-72 max-w-[calc(100vw-24px)] gap-0 border-border/70 bg-card/95 py-0 shadow-lg backdrop-blur">
      <CardContent className="p-3.5">
        <header className="mb-2.5 flex items-center gap-2.5">
          <span className="size-3.5 flex-none rounded-[4px]" style={{ background: zone.color }} />
          <h2 className="flex-1 text-[15px] font-bold">{zone.label}</h2>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground"
            onClick={onClose}
            title="Cerrar"
            aria-label="Cerrar ficha de zona"
          >
            <X />
          </Button>
        </header>

        <dl className="flex flex-col gap-2">
          <Row k="Superficie" v={`${zone.surface.toLocaleString('es-ES')} m²`} />
          <Row k="Temperatura" v={zone.temp} />
          <Row k="Ubicaciones" v={zone.locations.toLocaleString('es-ES')} />
          <Row k="Ocupación" v={`~${zone.occupancy.toLocaleString('es-ES')} palets`} />
          <Row k="Pasillos" v={String(zone.aisles)} />
        </dl>

        {zone.storage === 'floor' && (
          <p className="mt-2.5 border-t pt-2 text-[10px] text-muted-foreground">
            Almacenaje en el suelo (calles de palets), sin estanterías.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-right text-[13px] font-semibold">{v}</dd>
    </div>
  );
}

export const ZoneCard = memo(ZoneCardBase);
