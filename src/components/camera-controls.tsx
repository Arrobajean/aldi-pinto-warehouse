'use client';

import { RotateCcw, RotateCw, Maximize2, Boxes } from 'lucide-react';
import type { SimsZoomLevel } from '@/three/sims-camera';

interface CameraControlsProps {
  zoomLevel: SimsZoomLevel;
  onRotate: (dir: 1 | -1) => void;
  onZoom: (level: SimsZoomLevel) => void;
  onWallMode: () => void;
  onReset: () => void;
}

const btn =
  'flex h-9 w-10 items-center justify-center rounded-lg border border-line bg-panel text-fg shadow-card transition-colors hover:border-accent hover:bg-panel-strong';

export function CameraControls({ zoomLevel, onRotate, onZoom, onWallMode, onReset }: CameraControlsProps) {
  return (
    <div className="absolute right-3 bottom-3 z-30 flex flex-col gap-1.5">
      <div className="flex justify-end gap-1.5">
        <button className={btn} title="Rotar ⟲" onClick={() => onRotate(-1)}>
          <RotateCcw size={15} />
        </button>
        <button className={btn} title="Rotar ⟳" onClick={() => onRotate(1)}>
          <RotateCw size={15} />
        </button>
      </div>
      <div className="flex justify-end gap-1.5">
        {([1, 2, 3] as SimsZoomLevel[]).map((lvl) => (
          <button
            key={lvl}
            className={`${btn} ${zoomLevel === lvl ? 'border-accent !text-accent' : ''}`}
            title={`Zoom ${lvl}`}
            onClick={() => onZoom(lvl)}
          >
            {lvl}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-1.5">
        <button className={btn} title="Modo de muros (M)" onClick={onWallMode}>
          <Boxes size={15} />
        </button>
        <button className={btn} title="Vista general (F)" onClick={onReset}>
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}