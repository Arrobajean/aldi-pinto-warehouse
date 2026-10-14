import type { TemperatureCategory, ZoneId } from '@/lib/types';
import { PALLET_HEIGHT } from '@/lib/sim/types';

export interface StockArticle {
  sku: string;
  name: string;
  brand: string;
  commercialCategory: string;
  family: string;
  temp: TemperatureCategory;
  rotation: 'A' | 'B' | 'C';
  palletsPerOrder: number;
  /** Vida útil en días (para FEFO). */
  shelfLifeDays: number;
}

export const COMMERCIAL_CATEGORIES = [
  'Alimentación fresca y envasada',
  'Bebidas',
  'Panadería y bollería',
  'Limpieza del hogar y droguería',
  'Higiene y cuidado personal',
  'Bazar (ALDI Deals)',
] as const;

export const PRIVATE_BRANDS = [
  'El Mercado de ALDI',
  'El Horno de ALDI',
  'La Cocina de ALDI',
  'La Tabla de ALDI',
  'GutBio',
  'Milsani',
  'Esselt',
  'Tandil',
  'Biocura',
  'Lacura',
  'Karlsquell',
  'ALDI Deals',
  'ALDI',
] as const;

interface FamilyConfig {
  commercialCategory: string;
  defaultBrand: string;
  temp: TemperatureCategory;
  items: { base: string; brand?: string }[];
}

const FAMILY_CONFIGS: Record<string, FamilyConfig> = {
  'Lácteos': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'Milsani',
    temp: 'Frío',
    items: [
      { base: 'Leche entera' },
      { base: 'Yogur natural cremoso' },
      { base: 'Mantequilla tradicional' },
      { base: 'Leche semidesnatada' },
      { base: 'Kéfir natural' },
      { base: 'Nata para cocinar' },
      { base: 'Leche ecológica desnatada', brand: 'GutBio' },
      { base: 'Yogur bio desnatado', brand: 'GutBio' },
    ],
  },
  'Cerdo y carnes': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'El Mercado de ALDI',
    temp: 'Frío',
    items: [
      { base: 'Pechuga de pollo de corral' },
      { base: 'Filete de ternera blanca' },
      { base: 'Chuletas de lomo de cerdo' },
      { base: 'Hamburguesa de vacuno 100%' },
      { base: 'Solomillo de pavo al corte' },
      { base: 'Carne picada mixta seleccionada' },
    ],
  },
  'Charcutería': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'La Tabla de ALDI',
    temp: 'Frío',
    items: [
      { base: 'Jamón serrano gran reserva' },
      { base: 'Jamón cocido extra' },
      { base: 'Chorizo ibérico loncheado' },
      { base: 'Queso semicurado lonchas' },
      { base: 'Salchichón de bellota' },
      { base: 'Pechuga de pavo braseada' },
      { base: 'Queso gouda loncheado' },
    ],
  },
  'Frutas': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'El Mercado de ALDI',
    temp: 'Frío',
    items: [
      { base: 'Plátano de Canarias IGP' },
      { base: 'Manzana Golden selecta' },
      { base: 'Naranja de mesa de Valencia' },
      { base: 'Fresa de Huelva' },
      { base: 'Melón piel de sapo' },
      { base: 'Aguacate ecológico', brand: 'GutBio' },
    ],
  },
  'Verduras': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'El Mercado de ALDI',
    temp: 'Frío',
    items: [
      { base: 'Tomate rama dulce' },
      { base: 'Lechuga iceberg crujiente' },
      { base: 'Pimiento rojo de huerta' },
      { base: 'Cebolla dulce selección' },
      { base: 'Patata lavada' },
      { base: 'Zanahorias ecológicas', brand: 'GutBio' },
    ],
  },
  'Panadería y bollería': {
    commercialCategory: 'Panadería y bollería',
    defaultBrand: 'El Horno de ALDI',
    temp: 'Seco',
    items: [
      { base: 'Pan rústico de masa madre' },
      { base: 'Barra de pan tradicional' },
      { base: 'Croissant de mantequilla horneado' },
      { base: 'Baguette multicereales' },
      { base: 'Pan de molde integral 100%' },
      { base: 'Magdalenas artesanas cuadradas' },
      { base: 'Galletas tostadas clásicas' },
      { base: 'Copos de avena bio', brand: 'GutBio' },
    ],
  },
  'Platos preparados': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'La Cocina de ALDI',
    temp: 'Frío',
    items: [
      { base: 'Tortilla de patatas con cebolla' },
      { base: 'Gazpacho tradicional refrigerado' },
      { base: 'Salmorejo cordobés selección' },
      { base: 'Ensalada césar con pollo preparada' },
      { base: 'Hummus clásico con aceite de oliva' },
      { base: 'Pasta fresca rellena cuatro quesos' },
      { base: 'Empanada de atún refrigerada' },
    ],
  },
  'Panadería congelada (bake-off)': {
    commercialCategory: 'Panadería y bollería',
    defaultBrand: 'El Horno de ALDI',
    temp: 'Congelado',
    items: [
      { base: 'Barra de pan precocida para hornear' },
      { base: 'Baguette masa madre para tienda' },
      { base: 'Croissants de mantequilla congelados' },
      { base: 'Pan rústico campesino precocido' },
      { base: 'Napolitanas de chocolate congeladas' },
      { base: 'Panecillos de semillas para hornear' },
    ],
  },
  'Patatas y verduras congeladas': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'El Mercado de ALDI',
    temp: 'Congelado',
    items: [
      { base: 'Patatas fritas corte fino ultracongeladas' },
      { base: 'Patatas corte gajo sazonadas' },
      { base: 'Menestra de verduras tradicional' },
      { base: 'Guisantes finos ultracongelados' },
      { base: 'Salteado de verduras campesino' },
      { base: 'Judías verdes troceadas ultracongeladas' },
    ],
  },
  'Hielo': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'ALDI',
    temp: 'Congelado',
    items: [
      { base: 'Bolsa cubitos de hielo party 2 kg' },
      { base: 'Bolsa hielo picado cóctel 2 kg' },
      { base: 'Hielo macizo gourmet 2 kg' },
    ],
  },
  'Congelados pescado': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'El Mercado de ALDI',
    temp: 'Congelado',
    items: [
      { base: 'Merluza del Cantábrico congelada' },
      { base: 'Gambas peladas ultracongeladas' },
      { base: 'Filetes de bacalao al punto de sal' },
      { base: 'Calamares limpios enteros' },
    ],
  },
  'Congelados platos': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'La Cocina de ALDI',
    temp: 'Congelado',
    items: [
      { base: 'Pizza masa fina barbacoa' },
      { base: 'Pizza margarita crujiente' },
      { base: 'Lasagna boloñesa con bechamel' },
      { base: 'Croquetas de jamón ibérico' },
      { base: 'Canelones rellenos de carne' },
      { base: 'Pollo empanado crujiente' },
    ],
  },
  'Helados': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'ALDI',
    temp: 'Congelado',
    items: [
      { base: 'Helado vainilla Bourbon Mucci' },
      { base: 'Polos de fresa natural Mucci' },
      { base: 'Conos de chocolate y crocanti Mucci' },
      { base: 'Tarrina helado dulce de leche Mucci' },
    ],
  },
  'Conservas': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'ALDI',
    temp: 'Seco',
    items: [
      { base: 'Atún claro en aceite de oliva' },
      { base: 'Tomate frito receta de la abuela' },
      { base: 'Espárragos blancos de Navarra IGP' },
      { base: 'Mejillones en escabeche Rías Baixas' },
      { base: 'Tomate triturado ecológico', brand: 'GutBio' },
    ],
  },
  'Legumbres': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'GutBio',
    temp: 'Seco',
    items: [
      { base: 'Lentejas pardinas bio' },
      { base: 'Garbanzos cocidos bio extra' },
      { base: 'Judías blancas selección' },
      { base: 'Guisantes finos extra' },
      { base: 'Alubias rojas campesinas' },
      { base: 'Arroz redondo de Valencia' },
      { base: 'Macarrones pluma trigo duro' },
    ],
  },
  'Aceites y salsas': {
    commercialCategory: 'Alimentación fresca y envasada',
    defaultBrand: 'ALDI',
    temp: 'Seco',
    items: [
      { base: 'Aceite de oliva virgen extra 5 L' },
      { base: 'AOVE ecológico primera prensada', brand: 'GutBio' },
      { base: 'Aceite de girasol refinado 5 L' },
      { base: 'Mayonesa casera huevo campero' },
      { base: 'Kétchup receta tradicional' },
      { base: 'Vinagre de Módena IGP' },
    ],
  },
  'Bebidas': {
    commercialCategory: 'Bebidas',
    defaultBrand: 'ALDI',
    temp: 'Seco',
    items: [
      { base: 'Agua mineral natural 1,5 L' },
      { base: 'Agua mineral garrafa 6 L' },
      { base: 'Gaseosa tradicional familiar' },
      { base: 'Refresco cola cero' },
      { base: 'Refresco naranja con gas' },
      { base: 'Refresco limón con gas' },
      { base: 'Cerveza especial rubia', brand: 'Karlsquell' },
      { base: 'Cerveza sin alcohol', brand: 'Karlsquell' },
      { base: 'Vino tinto Rioja crianza' },
      { base: 'Vino blanco Rueda Verdejo' },
      { base: 'Zumo de piña bio', brand: 'GutBio' },
    ],
  },
  'Zumos': {
    commercialCategory: 'Bebidas',
    defaultBrand: 'Tamán',
    temp: 'Frío',
    items: [
      { base: 'Smoothie fresa y plátano' },
      { base: 'Zumo de naranja refrigerado con pulpa' },
      { base: 'Zumo de manzana bio refrigerado', brand: 'GutBio' },
      { base: 'Néctar de melocotón artesano' },
    ],
  },
  'Limpieza y droguería': {
    commercialCategory: 'Limpieza del hogar y droguería',
    defaultBrand: 'Esselt',
    temp: 'Seco',
    items: [
      { base: 'Detergente líquido ropa blanca', brand: 'Tandil' },
      { base: 'Detergente cápsulas 3 en 1', brand: 'Tandil' },
      { base: 'Suavizante concentrado caricia' },
      { base: 'Pastillas lavavajillas all-in-one' },
      { base: 'Friegasuelos aroma lavanda' },
      { base: 'Papel higiénico 3 capas confort' },
      { base: 'Bolsas de basura autocierre 30L' },
    ],
  },
  'Higiene y cosmética': {
    commercialCategory: 'Higiene y cuidado personal',
    defaultBrand: 'Biocura',
    temp: 'Seco',
    items: [
      { base: 'Gel de baño hidratante aloe bio' },
      { base: 'Crema facial anti-edad Q10', brand: 'Lacura' },
      { base: 'Sérum hidratante hialurónico', brand: 'Lacura' },
      { base: 'Champú reparador argán' },
      { base: 'Crema corporal nutritiva', brand: 'Lacura' },
      { base: 'Dentífrico triple acción blanqueante' },
      { base: 'Desodorante roll-on invisible', brand: 'Lacura' },
    ],
  },
  'Bazar': {
    commercialCategory: 'Bazar (ALDI Deals)',
    defaultBrand: 'ALDI Deals',
    temp: 'Seco',
    items: [
      { base: 'Set sartenes antiadherentes titanio' },
      { base: 'Taladro percutor a batería Ferrex' },
      { base: 'Juego de sábanas algodón percal' },
      { base: 'Lámpara LED regulable sobremesa' },
      { base: 'Aspirador de mano ciclónico' },
      { base: 'Tendedero plegable de aluminio' },
    ],
  },
};

const FAMILIES = Object.keys(FAMILY_CONFIGS);

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rango de SKU del catálogo simulado: SKU-1000 … SKU-2799. */
const SKU_FIRST = 1000;
const CATALOG_SIZE = 1800;

const catalogo = new Map<string, StockArticle>();

/** Genera un artículo determinista a partir del número de SKU (mismo SKU → mismo artículo, siempre). */
function generateArticle(sku: string, num: number): StockArticle {
  const rng = mulberry(num + 31);
  const familyKey = FAMILIES[Math.floor(rng() * FAMILIES.length)];
  const fam = FAMILY_CONFIGS[familyKey];
  const itemDef = fam.items[Math.floor(rng() * fam.items.length)];
  const brand = itemDef.brand ?? fam.defaultBrand;
  const roll = rng();
  return {
    sku,
    name: `${itemDef.base} (${brand}) #${num % 40}`,
    brand,
    commercialCategory: fam.commercialCategory,
    family: familyKey,
    temp: fam.temp,
    rotation: roll < 0.2 ? 'A' : roll < 0.55 ? 'B' : 'C',
    palletsPerOrder: 1 + Math.floor(rng() * 4),
    shelfLifeDays: fam.temp === 'Frío' ? 5 + Math.floor(rng() * 25) : 30 + Math.floor(rng() * 270),
  };
}

/**
 * Catálogo simulado de ~1.800 artículos con marcas y familias oficiales ALDI.
 * Se deriva de `articleForSku`, así un SKU tiene siempre la misma familia y temperatura en toda la app.
 */
export function getCatalog(): StockArticle[] {
  const out: StockArticle[] = [];
  for (let i = 0; i < CATALOG_SIZE; i++) out.push(articleForSku(`SKU-${SKU_FIRST + i}`));
  return out;
}

/** Artículo del catálogo correspondiente a un SKU (válido también para SKU aleatorios). */
export function articleForSku(sku: string | undefined): StockArticle {
  const num = Number(sku?.replace(/\D+/g, '') ?? 0) || SKU_FIRST;
  const key = sku ?? `SKU-${num}`;
  let hit = catalogo.get(key);
  if (!hit) {
    hit = generateArticle(key, num);
    catalogo.set(key, hit);
  }
  return hit;
}

/** Temperatura de almacenaje de la simulación (sala de la nave). */
export type StorageTemp = 'dry' | 'cool' | 'frozen';

const CATEGORY_BY_STORAGE: Record<StorageTemp, TemperatureCategory> = {
  dry: 'Seco',
  cool: 'Frío',
  frozen: 'Congelado',
};

/** Familias que no van en estantería: la FyV se almacena en el suelo de su propia zona. */
const NON_RACK_FAMILIES = new Set(['Frutas', 'Verduras']);

let skusByTemp: Record<StorageTemp, string[]> | null = null;

/**
 * SKU del catálogo cuya temperatura coincide con la sala (`dry` → Seco, `cool` → Frío, `frozen` → Congelado).
 * `r` ∈ [0, 1) elige el artículo de forma determinista. Así un palé de seco nunca lleva producto de frío.
 */
export function skuForTemp(temp: StorageTemp, r: number): string {
  if (!skusByTemp) {
    const index: Record<StorageTemp, string[]> = { dry: [], cool: [], frozen: [] };
    for (const article of getCatalog()) {
      if (NON_RACK_FAMILIES.has(article.family)) continue;
      for (const t of ['dry', 'cool', 'frozen'] as const) {
        if (article.temp === CATEGORY_BY_STORAGE[t]) index[t].push(article.sku);
      }
    }
    skusByTemp = index;
  }
  const list = skusByTemp[temp];
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(r * list.length)))];
}

/**
 * Asignación de familias a cada pasillo de la nave (slotting logístico ALDI Pinto).
 * - Seco (S-01 a S-24): Bebidas agrupadas, despensa/legumbres, conservas/aceites, panadería seca,
 *   limpieza y droguería estrictamente segregada de alimentos, higiene personal y bazar.
 * - Frío (F-01 a F-07): Lácteos, charcutería, carnes/aves y platos preparados refrigerados + zumos frescos.
 * - Congelado (C-01 a C-06): Panadería bake-off congelada para tienda, patatas fritas/verduras/hielo,
 *   pescados, platos preparados congelados y helados.
 */
export const AISLE_FAMILY_MAP: Record<string, string[]> = {
  // --- ZONA SECO (S-01 a S-17) ---
  'S-01': ['Bebidas'],
  'S-02': ['Bebidas'],
  'S-03': ['Aceites y salsas'],

  'S-04': ['Legumbres'],
  'S-05': ['Legumbres'],
  'S-06': ['Legumbres'],

  'S-07': ['Conservas'],
  'S-08': ['Conservas'],

  'S-09': ['Panadería y bollería'],
  'S-10': ['Panadería y bollería'],

  'S-11': ['Higiene y cosmética'],
  'S-12': ['Higiene y cosmética'],

  'S-13': ['Limpieza y droguería'],
  'S-14': ['Limpieza y droguería'],
  'S-15': ['Limpieza y droguería'],
  'S-16': ['Limpieza y droguería'],

  'S-17': ['Bazar'],

  // --- ZONA FRÍO (F-01 a F-10) ---
  'F-01': ['Zumos'],
  'F-02': ['Lácteos'],
  'F-03': ['Charcutería'],
  'F-04': ['Lácteos'],
  'F-05': ['Charcutería'],
  'F-06': ['Cerdo y carnes'],
  'F-07': ['Cerdo y carnes'],
  'F-08': ['Platos preparados'],
  'F-09': ['Platos preparados'],
  'F-10': ['Zumos'],

  // --- ZONA CONGELADO (C-01 a C-04) ---
  'C-01': ['Panadería congelada (bake-off)'],
  'C-02': ['Patatas y verduras congeladas', 'Hielo'],
  'C-03': ['Congelados pescado'],
  'C-04': ['Congelados platos', 'Helados'],
};

let skusByAisle: Map<string, string[]> | null = null;

function ensureAisleSkus(): Map<string, string[]> {
  if (skusByAisle) return skusByAisle;
  const map = new Map<string, string[]>();
  const catalog = getCatalog();
  const byFamily = new Map<string, string[]>();

  for (const art of catalog) {
    if (NON_RACK_FAMILIES.has(art.family)) continue;
    const list = byFamily.get(art.family) ?? [];
    list.push(art.sku);
    byFamily.set(art.family, list);
  }

  for (const [aisle, families] of Object.entries(AISLE_FAMILY_MAP)) {
    const aisleSkus: string[] = [];
    for (const fam of families) {
      const fSkus = byFamily.get(fam);
      if (fSkus) aisleSkus.push(...fSkus);
    }
    map.set(aisle, aisleSkus);
  }
  skusByAisle = map;
  return map;
}

/**
 * Selecciona un SKU determinista asignado a la familia correspondiente al pasillo (`aisleId`).
 * Así las bebidas quedan concentradas en S-01..S-04, la droguería en S-16..S-19, el pan congelado en C-01..C-02, etc.
 */
export function skuForAisle(aisleId: string, zoneId: ZoneId | string | undefined, r: number): string {
  const normAisle = aisleId.replace(/^SEC-/, 'S-').replace(/^FRI-/, 'F-').replace(/^CON-/, 'C-');
  const map = ensureAisleSkus();
  const list = map.get(normAisle);
  if (list && list.length > 0) {
    const idx = Math.min(list.length - 1, Math.max(0, Math.floor(r * list.length)));
    return list[idx];
  }
  const temp: StorageTemp = zoneId === 'frio' ? 'cool' : zoneId === 'congelado' ? 'frozen' : 'dry';
  return skuForTemp(temp, r);
}

/**
 * Nombre legible de la categoría/familias asignadas a un pasillo (p. ej. 'Bebidas', 'Limpieza y droguería').
 */
export function aisleCategoryLabel(aisleId: string): string {
  const norm = aisleId.replace(/^SEC-/, 'S-').replace(/^FRI-/, 'F-').replace(/^CON-/, 'C-');
  const fams = AISLE_FAMILY_MAP[norm];
  if (!fams || fams.length === 0) return 'General';
  return fams.join(' / ');
}
/**
 * Caja de venta (bulto) de cada familia, en metros: largo × ancho × alto. Aproximación de cajas de cartón estándar:
 * las pequeñas (cosmética, conservas) dan muchos bultos por palé y las grandes (bazar) muy pocos.
 */
const CAJA_POR_FAMILIA: Record<string, [number, number, number]> = {
  'Lácteos': [0.4, 0.3, 0.25],
  'Cerdo y carnes': [0.4, 0.3, 0.2],
  'Charcutería': [0.4, 0.3, 0.2],
  'Frutas': [0.4, 0.3, 0.2],
  'Verduras': [0.4, 0.3, 0.2],
  'Panadería y bollería': [0.4, 0.3, 0.2],
  'Platos preparados': [0.4, 0.3, 0.2],
  'Panadería congelada (bake-off)': [0.4, 0.3, 0.25],
  'Patatas y verduras congeladas': [0.4, 0.3, 0.25],
  'Hielo': [0.4, 0.3, 0.3],
  'Congelados pescado': [0.4, 0.3, 0.25],
  'Congelados platos': [0.4, 0.3, 0.25],
  'Helados': [0.4, 0.3, 0.25],
  'Conservas': [0.4, 0.3, 0.2],
  'Legumbres': [0.4, 0.3, 0.2],
  'Aceites y salsas': [0.36, 0.25, 0.25],
  'Bebidas': [0.3, 0.2, 0.3],
  'Zumos': [0.3, 0.2, 0.3],
  'Limpieza y droguería': [0.4, 0.3, 0.3],
  'Higiene y cosmética': [0.35, 0.25, 0.2],
  'Bazar': [0.6, 0.4, 0.4],
};

/** Palé europeo de 1,20 × 0,80 m con base de 0,144 m; altura total estándar de 1,60 m. */
const PALET_BASE_M2 = 1.2 * 0.8;
const PALET_BASE_H = 0.144;
/** Aprovechamiento del volumen de la carga (huecos entre cajas y retractilado). */
const CARGA_EFICIENCIA = 0.75;

const STORAGE_TEMP_DE_CATEGORIA: Partial<Record<TemperatureCategory, StorageTemp>> = {
  'Seco': 'dry',
  'Frío': 'cool',
  'Congelado': 'frozen',
};

/** Bultos (cajas) que caben en un palé de una familia, según el tamaño de su caja. */
export function bultosPorPaleFamilia(family: string): number {
  const dims = CAJA_POR_FAMILIA[family];
  if (!dims) return 0;
  const [largo, ancho, alto] = dims;
  const volumenCarga = PALET_BASE_M2 * (PALLET_HEIGHT - PALET_BASE_H) * CARGA_EFICIENCIA;
  return Math.floor(volumenCarga / (largo * ancho * alto));
}

/** Bultos por palé de media en una zona térmica (media simple de sus familias). Es la zona donde se hace el picking. */
export function bultosPorPaleZona(temp: StorageTemp): number {
  const valores = Object.entries(FAMILY_CONFIGS)
    .filter(([, fam]) => STORAGE_TEMP_DE_CATEGORIA[fam.temp] === temp)
    .map(([family]) => bultosPorPaleFamilia(family));
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** Bultos por palé de media en la red (media de las tres zonas). Sirve para pasar palés de referencia a bultos. */
export function bultosPorPaleMedio(): number {
  const zonas: StorageTemp[] = ['dry', 'cool', 'frozen'];
  return Math.round(zonas.reduce((a, z) => a + bultosPorPaleZona(z), 0) / zonas.length);
}

/** Reparto de los bultos de un pedido entre zonas térmicas (fracción que se prepara en seco, frío y congelado). */
export const REPARTO_PEDIDO_POR_ZONA: Record<StorageTemp, number> = { dry: 0.7, cool: 0.2, frozen: 0.1 };

/**
 * Familias que prepara el turno de tarde: cárnicos (carne, aves, embutidos) y vegetales. El turno de mañana prepara
 * el resto de familias, y lo que le falte pasa a la tarde.
 */
export const FAMILIAS_TURNO_TARDE: ReadonlySet<string> = new Set([
  'Cerdo y carnes',
  'Charcutería',
  'Frutas',
  'Verduras',
  'Patatas y verduras congeladas',
]);
