'use client';

import { Pause, Play, RotateCcw } from 'lucide-react';
import type { SimState } from '@/lib/sim/types';
import { formatSimTime } from '@/lib/sim/clock';
import type { SimSpeed } from '@/hooks/use-simulation';

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

export function SimControls({ state, speed, running, onPlay, onPause, onSpeed, onRestart }: SimControlsProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-card border border-line bg-panel/95 px-3 py-2 shadow-card backdrop-blur">
      <span className="flex items-center gap-1.5 font-mono text-sm text-accent">
        <span className="h-2 w-2 rounded-full bg-accent" />
        {state ? formatSimTime(state.ts) : '—'}
      </span>
      <span className="rounded-md bg-panel-strong px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
        Turno {state?.shiftId ?? '…'}
      </span>
      <span className="mx-1 h-5 w-px bg-line" />
      <button
        className="flex h-8 w-9 items-center justify-center rounded-lg border border-line bg-panel-strong text-fg transition-colors hover:border-accent"
        onClick={running ? onPause : onPlay}
        title={running ? 'Pausar' : 'Reproducir'}
      >
        {running ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="flex gap-1">
        {SPEEDS.map((v) => (
          <button
            key={v}
            className={`rounded-lg border px-2 py-1 font-mono text-[11px] transition-colors ${
              speed === v ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg'
            }`}
            onClick={() => onSpeed(v)}
          >
            {v === 0 ? '‖' : `×${v}`}
          </button>
        ))}
      </div>
      <button
        className="flex h-8 w-9 items-center justify-center rounded-lg border border-line bg-panel-strong text-muted transition-colors hover:text-fg"
        onClick={onRestart}
        title="Reiniciar día"
      >
        <RotateCcw size={13} />
      </button>
    </div>
  );
}