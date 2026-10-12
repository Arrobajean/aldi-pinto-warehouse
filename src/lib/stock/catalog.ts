import type { TemperatureCategory } from '@/lib/types';

export interface StockArticle {
  sku: string;
  name: string;
  family: string;
  temp: TemperatureCategory;
  rotation: 'A' | 'B' | 'C';
  palletsPerOrder: number;
  /** Vida útil en días (para FEFO). */
  shelfLifeDays: number;
}

const FAMILIES = [
  'Conservas',
  'Bebidas',
  'Bazar',
  'Legumbres',
  'Aceites y salsas',
  'Lácteos',
  'Cerdo y carnes',
  'Zumos',
  'Congelados pescado',
  'Congelados platos',
  'Helados',
  'Frutas',
  'Verduras',
];

const BASE_NAMES: Record<string, string[]> = {
  'Conservas': ['Atún claro', 'Tomate frito', 'Merluza en salsa', 'Espárragos', 'Mejillones'],
  'Bebidas': ['Agua 1,5 L', 'Refresco cola', 'Zumo naranja', 'Cerveza', 'Agua 6 L'],
  'Bazar': ['Papel higiénico', 'Detergente', 'Servilletas', 'Velas', 'Bolsas basura'],
  'Legumbres': ['Lentejas', 'Garbanzos', 'Judías blancas', 'Guisantes', 'Alubias rojas'],
  'Aceites y salsas': ['AOVE 5 L', 'Girasol 5 L', 'Vinagre', 'Mayonesa', 'Kétchup'],
  'Lácteos': ['Leche entera', 'Yogur natural', 'Queso lonchas', 'Mantequilla', 'Nata'],
  'Cerdo y carnes': ['Chorizo', 'Jamón cocido', 'Salami', 'Bacon', 'Pechuga pavo'],
  'Zumos': ['Zumo manzana', 'Zumo piña', 'Smoothie fresa', 'Néctar melocotón'],
  'Congelados pescado': ['Merluza congelada', 'Gambas', 'Bacalao', 'Calamares congelados'],
  'Congelados platos': ['Pizza margarita', 'Lasana', 'Croquetas', 'Pollo empanado'],
  'Helados': ['Helado vainilla', 'Polos fresa', 'Cono chocolate', 'Helado limón'],
  'Frutas': ['Manzana', 'Plátano', 'Naranja', 'Fresa', 'Melón'],
  'Verduras': ['Tomate', 'Lechuga', 'Pimiento', 'Cebolla', 'Patata'],
};

const TEMP_BY_FAMILY: Record<string, TemperatureCategory> = {
  'Conservas': 'Seco',
  'Bebidas': 'Seco',
  'Bazar': 'Seco',
  'Legumbres': 'Seco',
  'Aceites y salsas': 'Seco',
  'Lácteos': 'Frío',
  'Cerdo y carnes': 'Frío',
  'Zumos': 'Frío',
  'Congelados pescado': 'Congelado',
  'Congelados platos': 'Congelado',
  'Helados': 'Congelado',
  'Frutas': 'Frío',
  'Verduras': 'Frío',
};

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

const catalogo = new Map<string, StockArticle>();
let built = false;

/** Genera (una vez) el catálogo simulado de ~1.800 artículos. */
export function getCatalog(): StockArticle[] {
  if (built) return [...catalogo.values()];
  built = true;
  const rng = mulberry(20260401);
  for (let i = 0; i < 1800; i++) {
    const family = FAMILIES[Math.floor(rng() * FAMILIES.length)];
    const base = BASE_NAMES[family][Math.floor(rng() * BASE_NAMES[family].length)];
    const variant = Math.floor(rng() * 50) + 1;
    const roll = rng();
    const rotation: StockArticle['rotation'] = roll < 0.2 ? 'A' : roll < 0.55 ? 'B' : 'C';
    const skuNum = 1000 + i;
    const sku = `SKU-${skuNum}`;
    catalogo.set(sku, {
      sku,
      name: `${base} #${variant}`,
      family,
      temp: TEMP_BY_FAMILY[family] ?? 'Seco',
      rotation,
      palletsPerOrder: 1 + Math.floor(rng() * 4),
      shelfLifeDays: 5 + Math.floor(rng() * 300),
    });
  }
  return [...catalogo.values()];
}

/** Artículo del catálogo correspondiente a un SKU (válido también para SKU aleatorios). */
export function articleForSku(sku: string | undefined): StockArticle {
  if (sku) {
    const hit = catalogo.get(sku);
    if (hit) return hit;
  }
  // Genera uno determinista a partir del SKU.
  const num = Number(sku?.replace(/\D+/g, '') ?? 0) || 1000;
  const rng = mulberry(num + 31);
  const family = FAMILIES[Math.floor(rng() * FAMILIES.length)];
  const roll = rng();
  return {
    sku: sku ?? `SKU-${num}`,
    name: `${BASE_NAMES[family][Math.floor(rng() * BASE_NAMES[family].length)]} #${num % 40}`,
    family,
    temp: TEMP_BY_FAMILY[family] ?? 'Seco',
    rotation: roll < 0.2 ? 'A' : roll < 0.55 ? 'B' : 'C',
    palletsPerOrder: 1 + Math.floor(rng() * 4),
    shelfLifeDays: 5 + Math.floor(rng() * 300),
  };
}