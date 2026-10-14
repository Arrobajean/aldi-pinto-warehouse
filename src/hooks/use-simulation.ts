'use client';

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { buildPintoLayout } from '@/lib/layout/pinto-layout';
import { createInitialState } from '@/lib/sim/init';
import { makeDeps, tick } from '@/lib/sim/tick';
import { advance } from '@/lib/sim/clock';
import type { SimState } from '@/lib/sim/types';
import type { WarehouseScene } from '@/three/warehouse-scene';

export type SimSpeed = 0 | 1 | 10 | 60 | 300;

export function useSimulation(sceneRef: MutableRefObject<WarehouseScene | null>) {
  const layout = useMemo(() => buildPintoLayout(), []);
  const deps = useMemo(() => makeDeps(layout), [layout]);
  const [epoch, setEpoch] = useState(0);
  const simState = useMemo(() => {
    void epoch;
    return createInitialState(layout);
  }, [layout, epoch]);
  const [uiState, setUiState] = useState<SimState>(simState);
  const [speed, setSpeed] = useState<SimSpeed>(1); // tiempo real por defecto
  const [running, setRunning] = useState(true);

  const speedRef = useRef(speed);
  const runningRef = useRef(running);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let uiAcc = 0;
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      simState.speed = speedRef.current;
      simState.running = runningRef.current;
      advance(simState, dt, (inner, d) => tick(inner, deps, d));
      sceneRef.current?.syncSimulation(simState, dt);
      uiAcc += dt;
      if (uiAcc >= 0.25) {
        uiAcc = 0;
        setUiState({ ...simState });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [deps, layout, sceneRef, simState]);

  const acciones = useMemo(
    () => ({
      play() {
        setRunning(true);
      },
      pause() {
        setRunning(false);
      },
      setSpeed(v: SimSpeed) {
        setSpeed(v);
      },
      restart() {
        setEpoch((e) => e + 1);
      },
      updateStrapper(id: string, x: number, z: number) {
        const st = deps.layout.strappers.find((s) => s.id === id);
        if (st) {
          const halfW = (st.rect.xMax - st.rect.xMin) / 2 || 10;
          const halfD = (st.rect.zMax - st.rect.zMin) / 2 || 2.5;
          st.rect.xMin = x - halfW;
          st.rect.xMax = x + halfW;
          st.rect.zMin = z - halfD;
          st.rect.zMax = z + halfD;
          st.input.x = x - halfW - 2;
          st.input.z = z;
          st.output.x = x + halfW + 2;
          st.output.z = z;
        }
      },
    }),
    [deps],
  );

  return {
    state: uiState,
    layout,
    speed,
    running,
    acciones,
  };
}