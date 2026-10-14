'use client';

import { useState, useEffect, memo, type MutableRefObject } from 'react';
import { Crosshair, Move, RotateCcw, X, Eye } from 'lucide-react';
import type { WarehouseScene } from '@/three/warehouse-scene';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export interface StrapperControlsProps {
  open: boolean;
  onClose: () => void;
  sceneRef: MutableRefObject<WarehouseScene | null>;
  onUpdateStrapper?: (id: string, x: number, z: number) => void;
}

interface StrapperPos {
  x: number;
  z: number;
}

const DEFAULT_POSITIONS: Record<string, StrapperPos> = {
  'FLJ-01': { x: 46.9, z: -14 },
  'FLJ-02': { x: 46.9, z: -2 },
};

interface Preset {
  label: string;
  desc: string;
  pos: (current: StrapperPos) => StrapperPos;
}

const PRESETS: Record<string, Preset[]> = {
  'FLJ-01': [
    { label: 'Área de flejado (Original)', desc: 'X: 46.9m · Z: -14m', pos: () => ({ x: 46.9, z: -14 }) },
    { label: 'Expedición Oeste', desc: 'X: -55m · Z: 60.5m', pos: () => ({ x: -55, z: 60.5 }) },
  ],
  'FLJ-02': [
    { label: 'Área de flejado (Original)', desc: 'X: 46.9m · Z: -2m', pos: () => ({ x: 46.9, z: -2 }) },
    { label: 'Expedición Este', desc: 'X: 55m · Z: 60.5m', pos: () => ({ x: 55, z: 60.5 }) },
  ],
};

function NudgeGrid({ onNudge }: { onNudge: (dx: number, dz: number) => void }) {
  const steps: [number, number, string][] = [
    [-5, 0, '-5m X'],
    [-1, 0, '-1m X'],
    [1, 0, '+1m X'],
    [5, 0, '+5m X'],
    [0, -5, '-5m Z'],
    [0, -1, '-1m Z'],
    [0, 1, '+1m Z'],
    [0, 5, '+5m Z'],
  ];

  return (
    <div className="mt-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ajuste fino (Paso)</span>
      <div className="mt-1.5 grid grid-cols-4 gap-1">
        {steps.map(([dx, dz, label]) => (
          <Button
            key={label}
            variant="outline"
            size="sm"
            onClick={() => onNudge(dx, dz)}
            className="h-7 px-2 font-mono text-xs"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PresetList({
  presets,
  currentPos,
  onSelect,
}: {
  presets: Preset[];
  currentPos: StrapperPos;
  onSelect: (x: number, z: number) => void;
}) {
  return (
    <div className="mt-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Posiciones Predefinidas</span>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            onClick={() => {
              const target = preset.pos(currentPos);
              onSelect(target.x, target.z);
            }}
            className="h-auto flex-col items-start gap-0.5 p-2 text-left"
          >
            <span className="text-xs font-semibold leading-tight">{preset.label}</span>
            <span className="font-normal text-[10px] text-muted-foreground">{preset.desc}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function StrapperControlsBase({ open, onClose, sceneRef, onUpdateStrapper }: StrapperControlsProps) {
  const [selectedId, setSelectedId] = useState<'FLJ-01' | 'FLJ-02'>('FLJ-01');
  const [positions, setPositions] = useState<Record<string, StrapperPos>>(DEFAULT_POSITIONS);
  const [isHighlighted, setIsHighlighted] = useState(true);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      const p1 = scene.getStrapperPosition('FLJ-01');
      const p2 = scene.getStrapperPosition('FLJ-02');
      if (p1 || p2) {
        setPositions({
          'FLJ-01': p1 ?? DEFAULT_POSITIONS['FLJ-01'],
          'FLJ-02': p2 ?? DEFAULT_POSITIONS['FLJ-02'],
        });
      }
    }
  }, [sceneRef]);

  useEffect(() => {
    if (!open) {
      sceneRef.current?.highlightStrapper('FLJ-01', false);
      sceneRef.current?.highlightStrapper('FLJ-02', false);
      return;
    }
    const otherId = selectedId === 'FLJ-01' ? 'FLJ-02' : 'FLJ-01';
    sceneRef.current?.highlightStrapper(otherId, false);
    sceneRef.current?.highlightStrapper(selectedId, isHighlighted);
  }, [open, selectedId, isHighlighted, sceneRef]);

  if (!open) return null;

  const currentPos = positions[selectedId];

  const updatePosition = (newX: number, newZ: number) => {
    const clampedX = Math.round(Math.max(-118, Math.min(125, newX)) * 2) / 2;
    const clampedZ = Math.round(Math.max(-110, Math.min(74, newZ)) * 2) / 2;

    const next = { ...positions, [selectedId]: { x: clampedX, z: clampedZ } };
    setPositions(next);

    sceneRef.current?.setStrapperPosition(selectedId, clampedX, clampedZ);
    onUpdateStrapper?.(selectedId, clampedX, clampedZ);
  };

  const handleNudge = (dx: number, dz: number) => {
    updatePosition(currentPos.x + dx, currentPos.z + dz);
  };

  const handleFocus = () => {
    sceneRef.current?.focusStrapper(selectedId);
  };

  const handleReset = () => {
    const initial = DEFAULT_POSITIONS[selectedId];
    updatePosition(initial.x, initial.z);
  };

  return (
    <Card className="pointer-events-auto fixed right-16 top-16 z-50 w-96 gap-0 border-border/70 bg-card/95 py-0 shadow-2xl backdrop-blur-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <Move className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Reposicionamiento Flejadoras</h3>
              <p className="text-[11px] text-muted-foreground">Ajuste manual de trenes de flejado</p>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={onClose} title="Cerrar panel" aria-label="Cerrar panel de flejadoras">
            <X />
          </Button>
        </div>

        <Tabs value={selectedId} onValueChange={(v) => setSelectedId(v as 'FLJ-01' | 'FLJ-02')} className="mt-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="FLJ-01" className="flex-col gap-0 py-1.5 text-xs">
              <span>FLJ-01</span>
              <span className="text-[10px] font-normal opacity-85">Fila norte</span>
            </TabsTrigger>
            <TabsTrigger value="FLJ-02" className="flex-col gap-0 py-1.5 text-xs">
              <span>FLJ-02</span>
              <span className="text-[10px] font-normal opacity-85">Fila sur</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-3 rounded-lg border bg-secondary/60 p-2.5">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-muted-foreground">Posición Centro:</span>
            <span className="font-bold">
              X: <span className="text-primary">{currentPos.x.toFixed(1)}m</span> · Z:{' '}
              <span className="text-primary">{currentPos.z.toFixed(1)}m</span>
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-muted-foreground">
            <span>Entrada: [{(currentPos.x - 11).toFixed(1)}, {currentPos.z.toFixed(1)}]</span>
            <span>Salida: [{(currentPos.x + 11).toFixed(1)}, {currentPos.z.toFixed(1)}]</span>
          </div>
        </div>

        <div className="mt-3.5 space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs">
              <Label className="font-semibold">Coordenada X (Este / Oeste)</Label>
              <div className="flex items-center gap-1 font-mono text-xs">
                <Input
                  type="number"
                  step="0.5"
                  min="-118"
                  max="125"
                  value={currentPos.x}
                  onChange={(e) => updatePosition(parseFloat(e.target.value) || 0, currentPos.z)}
                  aria-label="Coordenada X en metros"
                  className="h-7 w-16 px-1.5 text-right font-mono text-xs"
                />
                <span className="text-muted-foreground">m</span>
              </div>
            </div>
            <Slider
              className="mt-2"
              min={-118}
              max={125}
              step={0.5}
              value={[currentPos.x]}
              onValueChange={([v]) => updatePosition(v, currentPos.z)}
              aria-label="Ajustar coordenada X"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>Oeste (-118m)</span>
              <span>Centro (0m)</span>
              <span>Este (+125m)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs">
              <Label className="font-semibold">Coordenada Z (Norte / Muelles Sur)</Label>
              <div className="flex items-center gap-1 font-mono text-xs">
                <Input
                  type="number"
                  step="0.5"
                  min="-110"
                  max="74"
                  value={currentPos.z}
                  onChange={(e) => updatePosition(currentPos.x, parseFloat(e.target.value) || 0)}
                  aria-label="Coordenada Z en metros"
                  className="h-7 w-16 px-1.5 text-right font-mono text-xs"
                />
                <span className="text-muted-foreground">m</span>
              </div>
            </div>
            <Slider
              className="mt-2"
              min={-110}
              max={74}
              step={0.5}
              value={[currentPos.z]}
              onValueChange={([v]) => updatePosition(currentPos.x, v)}
              aria-label="Ajustar coordenada Z"
            />
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>Norte (-110m)</span>
              <span>Flejado (-14m)</span>
              <span>Muelles (+74m)</span>
            </div>
          </div>
        </div>

        <NudgeGrid onNudge={handleNudge} />

        <PresetList presets={PRESETS[selectedId]} currentPos={currentPos} onSelect={updatePosition} />

        <Separator className="my-3.5" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={handleFocus} title="Centrar la cámara en esta flejadora">
              <Crosshair />
              Enfocar
            </Button>
            <Button
              variant={isHighlighted ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsHighlighted(!isHighlighted)}
              title="Alternar resalte 3D de la flejadora"
              className={cn(isHighlighted && 'bg-primary/15 text-primary hover:bg-primary/25')}
            >
              <Eye />
              {isHighlighted ? 'Resaltada' : 'Sin resalte'}
            </Button>
          </div>

          <Button variant="ghost" size="sm" onClick={handleReset} className="text-[11px] text-muted-foreground" title="Restablecer posición por defecto">
            <RotateCcw />
            Restablecer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const StrapperControls = memo(StrapperControlsBase);
