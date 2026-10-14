/** Dependencias del paso de simulación (grafo, navegación, secciones y despacho). (extraído de tick.ts) */
import type { ConsolidationArea, WarehouseLayout } from '@/lib/layout/types';
import type { DispatchPolicy } from '@/lib/sim/dispatch';
import type { NavGrid } from '@/lib/sim/navgrid';
import { PathFinder } from '@/lib/sim/path';
import type { SectionIndex } from '@/lib/sim/sections';
import type { Pallet, Point } from '@/lib/sim/types';

export interface SimDeps {
  layout: WarehouseLayout;
  indoor: PathFinder;
  yard: PathFinder;
  dispatch: DispatchPolicy;
  /** Tramos de pasillo (uno por segmento de rack) con su eje y rango z (índice estático). */
  aisles: { id: string; xCenter: number; zMin: number; zMax: number }[];
  /** Puesto de trabajo frente a cada ubicación de rack. */
  slotStops: Map<string, Point>;
  /** Secciones de preparación y orden de recorrido de las ubicaciones. */
  sections: SectionIndex;
  /** Rejilla de navegación cooperativa de las máquinas. */
  nav: NavGrid;
  dockById: Map<string, import('@/lib/layout/types').Dock>;
  strapperById: Map<string, import('@/lib/layout/types').Strapper>;
  consolidationById: Map<string, ConsolidationArea>;
  consolidationByTemp: Map<Pallet['temp'], ConsolidationArea>;
}
