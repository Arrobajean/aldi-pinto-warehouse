/**
 * Secciones de trabajo de la plataforma.
 *
 * - Preparación (recogepedidos): el pedido de una tienda se reparte por secciones y cada parte es un lote aparte
 *   que prepara un solo preparador de esa sección. En seco, la sección es la familia del pasillo (Bebidas,
 *   Aceites y salsas, Legumbres…); frío y congelado son una sección cada uno.
 * - Ubicación y reposición (retráctiles): cada retráctil trabaja en un sector fijo: seco, frío o congelado.
 */
import { forEachRackSlot } from '@/lib/layout/pinto-layout';
import type { WarehouseLayout } from '@/lib/layout/types';
import type { Machine, Pallet } from '@/lib/sim/types';
import { aisleCategoryLabel } from '@/lib/stock/catalog';
import type { ZoneId } from '@/lib/types';

export type RackSector = 'seco' | 'frio' | 'congelado';

export const SECTOR_OF_TEMP: Record<Pallet['temp'], RackSector> = { dry: 'seco', cool: 'frio', frozen: 'congelado' };

/** Sección de preparación de frío: sus pedidos se recorren por pasillos de 1 a 9 en serpentina (ver `takeColdRoute`). */
export const COLD_SECTION = 'Frío';

/** Sección de preparación de un pasillo: familia en seco; la sala entera en frío y congelado. */
export function pickSection(aisleId: string, zoneId: ZoneId): string {
  if (zoneId === 'frio') return COLD_SECTION;
  if (zoneId === 'congelado') return 'Congelado';
  const label = aisleCategoryLabel(aisleId);
  return label === 'General' ? 'Seco varios' : label;
}

/** Retráctiles por sector (en proporción a las ubicaciones, con un mínimo de 2 en las cámaras). */
const REACH_BY_SECTOR: { sector: RackSector; share: number }[] = [
  { sector: 'seco', share: 9 },
  { sector: 'frio', share: 3 },
  { sector: 'congelado', share: 2 },
];

export interface SectionIndex {
  /** Sección de preparación de cada ubicación de rack. */
  sectionOfLoc: Map<string, string>;
  /** Familias de artículo asignadas al pasillo de cada ubicación (slotting). */
  familiesOfLoc: Map<string, Set<string>>;
  /** Orden de recorrido de cada ubicación: pasillo a pasillo (de oeste a este) y a lo largo del pasillo. */
  walkOrder: Map<string, number>;
  /** Secciones de cada categoría térmica con su peso en el pedido (pasillos que ocupan). */
  sectionsByTemp: Record<Pallet['temp'], { section: string; weight: number }[]>;
}

/** Índice estático de secciones a partir del plano. */
export function buildSectionIndex(layout: WarehouseLayout): SectionIndex {
  const sectionOfLoc = new Map<string, string>();
  const familiesOfLoc = new Map<string, Set<string>>();
  const aisleX = new Map(layout.aisles.map((a) => [a.id, a.xCenter]));
  const slots: { loc: string; x: number; z: number; aisle: string; zone: ZoneId }[] = [];
  const aislesBySection = new Map<string, { temp: Pallet['temp']; aisles: Set<string> }>();
  forEachRackSlot(layout, (slot) => {
    const section = pickSection(slot.aisleId, slot.zoneId);
    sectionOfLoc.set(slot.locationId, section);
    familiesOfLoc.set(slot.locationId, new Set(aisleCategoryLabel(slot.aisleId).split(' / ')));
    slots.push({ loc: slot.locationId, x: aisleX.get(slot.aisleId) ?? slot.x, z: slot.z, aisle: slot.aisleId, zone: slot.zoneId });
    const temp: Pallet['temp'] = slot.zoneId === 'frio' ? 'cool' : slot.zoneId === 'congelado' ? 'frozen' : 'dry';
    const entry = aislesBySection.get(section) ?? { temp, aisles: new Set<string>() };
    entry.aisles.add(slot.aisleId);
    aislesBySection.set(section, entry);
  });
  // Recorrido en serpentina: pasillos por zona (seco, frío, congelado) y por número (1, 2, 3…), alternando el sentido
  // a lo largo de cada pasillo. Ordenar por x mezclaba los pasillos de frío con los de congelado (mismo x) y rompía la S.
  const zoneRank: Partial<Record<ZoneId, number>> = { seco: 0, frio: 1, congelado: 2 };
  const zoneOf = new Map(slots.map((s) => [s.aisle, s.zone]));
  const aisleNum = (id: string) => Number(id.split('-')[1]);
  const aisleOrder = [...new Set(slots.map((s) => s.aisle))].sort(
    (a, b) => (zoneRank[zoneOf.get(a)!] ?? 9) - (zoneRank[zoneOf.get(b)!] ?? 9) || aisleNum(a) - aisleNum(b),
  );
  const aisleRank = new Map(aisleOrder.map((a, i) => [a, i]));
  slots.sort((a, b) => {
    const ra = aisleRank.get(a.aisle)!;
    const rb = aisleRank.get(b.aisle)!;
    if (ra !== rb) return ra - rb;
    return ra % 2 === 0 ? a.z - b.z : b.z - a.z;
  });
  const walkOrder = new Map(slots.map((s, i) => [s.loc, i]));
  const sectionsByTemp: SectionIndex['sectionsByTemp'] = { dry: [], cool: [], frozen: [] };
  for (const [section, { temp, aisles }] of aislesBySection) sectionsByTemp[temp].push({ section, weight: aisles.size });
  for (const t of ['dry', 'cool', 'frozen'] as const) sectionsByTemp[t].sort((a, b) => a.section.localeCompare(b.section));
  return { sectionOfLoc, familiesOfLoc, walkOrder, sectionsByTemp };
}

/**
 * Asigna a cada máquina su sección: los recogepedidos, una sección de preparación cada uno (las que sobran
 * refuerzan frío y después las secciones de seco más grandes); las retráctiles, un sector.
 * Si hay menos preparadores que secciones, alguno lleva varias. Las demás máquinas no tienen sección.
 */
export function assignSections(machines: Machine[], index: SectionIndex) {
  const pickers = machines.filter((m) => m.kind === 'recogepedidos');
  const all = [...index.sectionsByTemp.dry, ...index.sectionsByTemp.cool, ...index.sectionsByTemp.frozen];
  // Plantilla (kb/06): 2 preparadores de frío, 1 de congelado y el resto de seco (las secciones más grandes).
  const extra = [...index.sectionsByTemp.cool, ...[...index.sectionsByTemp.dry].sort((a, b) => b.weight - a.weight)];
  pickers.forEach((m, i) => {
    m.sections = i < all.length ? [all[i].section] : [extra[(i - all.length) % extra.length].section];
  });
  // Menos preparadores que secciones: las que faltan se reparten entre los que hay.
  for (let i = pickers.length; i < all.length; i++) pickers[i % pickers.length]?.sections?.push(all[i].section);

  const reach = machines.filter((m) => m.kind === 'retractil');
  const total = REACH_BY_SECTOR.reduce((k, s) => k + s.share, 0);
  let i = 0;
  for (const { sector, share } of REACH_BY_SECTOR) {
    const n = Math.max(1, Math.round((share / total) * reach.length));
    for (let k = 0; k < n && i < reach.length; k++) reach[i++].sections = [sector];
  }
  // Las que quedan (por redondeo), al seco.
  for (; i < reach.length; i++) reach[i].sections = ['seco'];
}
