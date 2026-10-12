'use client';

import { TopBar } from '@/components/top-bar';

const INDICADORES = [
  { label: 'Nave', value: '40.000 m²' },
  { label: 'Ubicaciones', value: '—' },
  { label: 'Muelles', value: '60' },
];

export function WarehouseApp() {
  return (
    <div className="flex h-full flex-col">
      <TopBar indicators={INDICADORES} />
      {/* En F1, el visor 3D se monta aquí con next/dynamic (ssr:false). */}
      <main className="relative min-h-0 flex-1 overflow-hidden bg-bg" />
      <footer className="flex items-center gap-4 border-t border-line bg-panel px-4 py-1.5 text-[11px] text-muted">
        <span>
          Plataforma logística de <strong className="font-semibold text-fg">ALDI en Pinto</strong> — 8 provincias servidas
        </span>
        <span>Datos simulados con fines de demostración</span>
      </footer>
    </div>
  );
}