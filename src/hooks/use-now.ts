'use client';

import { useSyncExternalStore } from 'react';

/**
 * Marca de tiempo actual (ms, redondeada al intervalo) o null en el render del servidor.
 * Con useSyncExternalStore el servidor y el primer render del cliente coinciden (null).
 */
export function useNow(intervalMs = 1000): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    () => null,
  );
}

export function formatClock(date: Date, withSeconds = true) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}
