'use client';

import { memo } from 'react';
import { RotateCcw, RotateCw, Maximize2, Boxes } from 'lucide-react';
import type { MutableRefObject } from 'react';
import type { SimsZoomLevel } from '@/three/sims-camera';
import type { WallMode } from '@/three/wall-modes';
import type { WarehouseScene } from '@/three/warehouse-scene';
import { Compass } from '@/components/compass';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CameraControlsProps {
  sceneRef?: MutableRefObject<WarehouseScene | null>;
  zoomLevel: SimsZoomLevel;
  wallMode: WallMode;
  onRotate: (dir: 1 | -1) => void;
  onLookTowards?: (cardinal: 'N' | 'S' | 'E' | 'O') => void;
  onZoom: (level: SimsZoomLevel) => void;
  onWallMode: () => void;
  onReset: () => void;
}

const WALL_MODE_LABELS: Record<WallMode, string> = { up: 'completos', cut: 'recorte', down: 'bajados' };

export const CameraControls = memo(function CameraControls({
  sceneRef,
  zoomLevel,
  wallMode,
  onRotate,
  onLookTowards,
  onZoom,
  onWallMode,
  onReset,
}: CameraControlsProps) {
  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      <Compass sceneRef={sceneRef} onLookTowards={onLookTowards} />

      <div className="flex justify-end gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" className="size-9 bg-card/90 backdrop-blur" onClick={() => onRotate(-1)}>
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rotar ⟲</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" className="size-9 bg-card/90 backdrop-blur" onClick={() => onRotate(1)}>
              <RotateCw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Rotar ⟳</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex justify-end gap-1.5">
        {([1, 2, 3] as SimsZoomLevel[]).map((lvl) => (
          <Button
            key={lvl}
            size="icon"
            variant={zoomLevel === lvl ? 'default' : 'outline'}
            className="size-9 bg-card/90 font-mono backdrop-blur"
            title={`Zoom ${lvl}`}
            onClick={() => onZoom(lvl)}
          >
            {lvl}
          </Button>
        ))}
      </div>

      <div className="flex justify-end gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={wallMode !== 'up' ? 'default' : 'outline'}
              className="size-9 bg-card/90 backdrop-blur"
              onClick={onWallMode}
            >
              <Boxes />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Muros y racks (M): {WALL_MODE_LABELS[wallMode]}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" className="size-9 bg-card/90 backdrop-blur" onClick={onReset}>
              <Maximize2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Vista general (F)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
});
