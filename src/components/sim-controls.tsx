'use client';

import { memo } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import { formatSimTime } from '@/lib/sim/clock';
import type { SimSpeed } from '@/hooks/use-simulation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SimControlsProps {
  state: SimState | null;
  speed: SimSpeed;
  running: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (v: SimSpeed) => void;
  onRestart: () => void;
}

const SPEEDS: SimSpeed[] = [0, 1, 10, 60, 300];

function SimControlsBase({ state, speed, running, onPlay, onPause, onSpeed, onRestart }: SimControlsProps) {
  return (
    <Card className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-row items-center gap-2 border-border/70 bg-card/90 px-3 py-2 shadow-lg backdrop-blur">
      <span className="flex items-center gap-1.5 font-mono text-sm text-primary">
        <span className="size-2 rounded-full bg-primary" />
        {state ? formatSimTime(state.ts) : '—'}
      </span>
      <Badge variant="secondary" className="font-mono text-[10px] uppercase">
        Turno {state?.shiftId ?? '…'}
      </Badge>
      <Separator orientation="vertical" className="mx-1 !h-5" />
      <Button
        size="icon"
        variant="outline"
        className="size-8"
        onClick={running ? onPause : onPlay}
        title={running ? 'Pausar' : 'Reproducir'}
        aria-label={running ? 'Pausar simulación' : 'Iniciar simulación'}
      >
        {running ? <Pause /> : <Play />}
      </Button>
      <div className="flex gap-1">
        {SPEEDS.map((v) => (
          <Button
            key={v}
            size="sm"
            variant={speed === v ? 'default' : 'outline'}
            className="h-7 px-2 font-mono text-[11px]"
            onClick={() => onSpeed(v)}
            aria-label={v === 0 ? 'Pausar velocidad' : `Velocidad ${v}x`}
          >
            {v === 0 ? '‖' : `×${v}`}
          </Button>
        ))}
      </div>
      <Button
        size="icon"
        variant="outline"
        className={cn('size-8 text-muted-foreground')}
        onClick={onRestart}
        title="Reiniciar día"
        aria-label="Reiniciar simulación"
      >
        <RotateCcw />
      </Button>
    </Card>
  );
}

export const SimControls = memo(SimControlsBase);
