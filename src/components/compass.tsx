'use client';

import React, { useEffect, useState, useMemo, type MutableRefObject } from 'react';
import type { WarehouseScene } from '@/three/warehouse-scene';

export interface CompassProps {
  sceneRef?: MutableRefObject<WarehouseScene | null>;
  rotationRad?: number;
  onLookTowards?: (cardinal: 'N' | 'S' | 'E' | 'O') => void;
  className?: string;
  size?: number;
}



const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

function getHeadingInfo(rotRad: number): { deg: number; cardinal: string } {
  const deg = (((-rotRad * 180) / Math.PI) % 360 + 360) % 360;
  const idx = Math.floor(((deg + 22.5) % 360) / 45);
  return { deg: Math.round(deg), cardinal: CARDINALS[idx] ?? 'N' };
}

export const Compass = React.memo(function Compass({ sceneRef, rotationRad, onLookTowards, className = '', size = 88 }: CompassProps) {
  const [internalAngle, setInternalAngle] = useState(rotationRad ?? Math.PI / 4);

  useEffect(() => {
    if (!sceneRef) return;
    let rafId: number;
    let lastAngle = -999;
    const checkRotation = () => {
      const scene = sceneRef.current;
      if (scene) {
        const curRot = scene.camera.getRotation();
        if (Math.abs(curRot - lastAngle) > 0.001) {
          lastAngle = curRot;
          setInternalAngle(curRot);
        }
      }
      rafId = requestAnimationFrame(checkRotation);
    };
    rafId = requestAnimationFrame(checkRotation);
    return () => cancelAnimationFrame(rafId);
  }, [sceneRef]);

  const activeAngle = rotationRad !== undefined ? rotationRad : internalAngle;

  const handleCardinalClick = (cardinal: 'N' | 'S' | 'E' | 'O', e: React.MouseEvent) => {
    e.stopPropagation();
    if (onLookTowards) {
      onLookTowards(cardinal);
    } else if (sceneRef?.current) {
      sceneRef.current.lookTowards(cardinal);
    }
  };

  const { deg, cardinal: currentCardinal } = useMemo(() => getHeadingInfo(activeAngle), [activeAngle]);

  // In screen projection, North rotates by activeAngle clockwise:
  const rotationDeg = (activeAngle * 180) / Math.PI;

  return (
    <div
      className={`group relative flex flex-col items-center select-none ${className}`}
      title={`Rosa de los vientos (${deg}° ${currentCardinal}) · Haz clic en N, S, E u O para alinear la vista`}
    >
      {/* Compass Circular Bezel */}
      <div
        className="relative flex items-center justify-center rounded-full border border-border/80 bg-card/95 p-1 shadow-lg backdrop-blur-md transition-colors hover:border-primary/60 hover:shadow-lg"
        style={{ width: size, height: size }}
      >
        {/* Subtle Outer Bezel Graduation Ring */}
        <div className="absolute inset-0 rounded-full border border-border/40 bg-radial from-card/40 to-card/90" />

        {/* Ticks ring */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none"
          viewBox="0 0 100 100"
          style={{ transform: `rotate(${rotationDeg}deg)` }}
        >
          {/* 12 tick marks around the compass circumference */}
          {Array.from({ length: 12 }).map((_, i) => {
            const tickAngle = i * 30;
            const isCardinal = i % 3 === 0;
            return (
              <line
                key={i}
                x1="50"
                y1={isCardinal ? '5' : '7'}
                x2="50"
                y2={isCardinal ? '11' : '9'}
                stroke={isCardinal ? (i === 0 ? '#f59e0b' : '#94a3b8') : 'rgba(148,163,184,0.35)'}
                strokeWidth={isCardinal ? '1.8' : '1'}
                transform={`rotate(${tickAngle} 50 50)`}
              />
            );
          })}
        </svg>

        {/* Rotating Compass Dial / Rosa de los Vientos */}
        <div
          className="relative flex h-full w-full items-center justify-center"
          style={{
            transform: `rotate(${rotationDeg}deg)`,
            transition: 'transform 0.05s linear',
          }}
        >
          {/* Rosa de los vientos Star SVG */}
          <svg
            className="h-[68%] w-[68%] pointer-events-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
            viewBox="0 0 100 100"
          >
            {/* Secondary 4-point diagonal rays */}
            <g opacity="0.45">
              <polygon points="50,50 48,50 50,22" fill="#64748b" transform="rotate(45 50 50)" />
              <polygon points="50,50 52,50 50,22" fill="#475569" transform="rotate(45 50 50)" />
              <polygon points="50,50 48,50 50,22" fill="#64748b" transform="rotate(135 50 50)" />
              <polygon points="50,50 52,50 50,22" fill="#475569" transform="rotate(135 50 50)" />
              <polygon points="50,50 48,50 50,22" fill="#64748b" transform="rotate(225 50 50)" />
              <polygon points="50,50 52,50 50,22" fill="#475569" transform="rotate(225 50 50)" />
              <polygon points="50,50 48,50 50,22" fill="#64748b" transform="rotate(315 50 50)" />
              <polygon points="50,50 52,50 50,22" fill="#475569" transform="rotate(315 50 50)" />
            </g>

            {/* East Ray (Right) */}
            <polygon points="50,50 50,47 84,50" fill="#38bdf8" />
            <polygon points="50,50 50,53 84,50" fill="#0284c7" />

            {/* South Ray (Bottom) */}
            <polygon points="50,50 47,50 50,84" fill="#94a3b8" />
            <polygon points="50,50 53,50 50,84" fill="#64748b" />

            {/* West Ray (Left) */}
            <polygon points="50,50 50,53 16,50" fill="#94a3b8" />
            <polygon points="50,50 50,47 16,50" fill="#64748b" />

            {/* North Ray (Top) - ALDI vermilion / orange with highlight */}
            <polygon points="50,50 46,50 50,14" fill="#fb923c" />
            <polygon points="50,50 54,50 50,14" fill="#ea580c" />
            {/* North center white spine line */}
            <line x1="50" y1="50" x2="50" y2="14" stroke="#ffffff" strokeWidth="0.8" opacity="0.8" />
          </svg>

          {/* Center Hub / Bezel Pin */}
          <div className="absolute h-3 w-3 rounded-full border border-sky-400 bg-sky-600 shadow-[0_0_8px_rgba(56,189,248,0.7)]">
            <div className="absolute inset-0.5 rounded-full bg-slate-900" />
            <div className="absolute inset-1 rounded-full bg-amber-400" />
          </div>

          {/* Interactive Cardinal Buttons positioned on the perimeter of the dial */}
          {/* NORTE (Top) */}
          <button
            type="button"
            onClick={(e) => handleCardinalClick('N', e)}
            className="group/btn absolute top-0.5 flex h-5 w-5 -translate-y-0.5 items-center justify-center rounded-full border border-amber-500/40 bg-card/90 text-[10px] text-amber-400 shadow transition-transform hover:scale-125 hover:border-amber-400 hover:bg-amber-500 hover:text-black cursor-pointer active:scale-95"
            title="Alinear cámara hacia el Norte [Z-]"
          >
            N
          </button>

          {/* ESTE (Right) */}
          <button
            type="button"
            onClick={(e) => handleCardinalClick('E', e)}
            className="group/btn absolute right-0.5 flex h-5 w-5 translate-x-0.5 items-center justify-center rounded-full border border-sky-500/40 bg-card/90 text-[10px] text-sky-400 shadow transition-transform hover:scale-125 hover:border-sky-400 hover:bg-sky-500 hover:text-black cursor-pointer active:scale-95"
            title="Alinear cámara hacia el Este [X+]"
          >
            E
          </button>

          {/* SUR (Bottom) */}
          <button
            type="button"
            onClick={(e) => handleCardinalClick('S', e)}
            className="group/btn absolute bottom-0.5 flex h-5 w-5 translate-y-0.5 items-center justify-center rounded-full border border-slate-500/40 bg-card/90 text-[10px] text-slate-300 shadow transition-transform hover:scale-125 hover:border-slate-300 hover:bg-slate-300 hover:text-black cursor-pointer active:scale-95"
            title="Alinear cámara hacia el Sur [Z+]"
          >
            S
          </button>

          {/* OESTE (Left) */}
          <button
            type="button"
            onClick={(e) => handleCardinalClick('O', e)}
            className="group/btn absolute left-0.5 flex h-5 w-5 -translate-x-0.5 items-center justify-center rounded-full border border-slate-500/40 bg-card/90 text-[10px] text-slate-300 shadow transition-transform hover:scale-125 hover:border-slate-300 hover:bg-slate-300 hover:text-black cursor-pointer active:scale-95"
            title="Alinear cámara hacia el Oeste [X-]"
          >
            O
          </button>
        </div>
      </div>

      {/* Mini Heading Tag below */}
      <div className="mt-1 flex items-center gap-1 rounded border border-border/60 bg-card/90 px-1.5 py-0.5 text-[10px] font-mono tracking-tight text-muted-foreground shadow-sm backdrop-blur">
        <span className="font-semibold text-foreground">{deg}°</span>
        <span className="text-[9px] font-bold text-primary">{currentCardinal}</span>
      </div>
    </div>
  );
});
