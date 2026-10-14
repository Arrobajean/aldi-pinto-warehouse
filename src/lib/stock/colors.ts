import type { StockArticle } from '@/lib/stock/catalog';

export type StockColorMode = 'occupancy' | 'family' | 'rotation' | 'fefo' | 'empty';

export const STOCK_MODES: { id: StockColorMode; label: string }[] = [
  { id: 'occupancy', label: 'Ocupación' },
  { id: 'family', label: 'Familia' },
  { id: 'rotation', label: 'Rotación ABC' },
  { id: 'fefo', label: 'Caducidad / FEFO' },
  { id: 'empty', label: 'Ubicación vacía' },
];

const FAMILY_COLORS: Record<string, number> = {
  // Seco
  'Bebidas': 0x2980b9,
  'Legumbres': 0xb0875a,
  'Conservas': 0xd4ac0d,
  'Aceites y salsas': 0xf39c12,
  'Panadería y bollería': 0xd35400,
  'Limpieza y droguería': 0x16a085,
  'Higiene y cosmética': 0xaf7ac5,
  'Bazar': 0x884ea0,
  // Frío
  'Lácteos': 0x85c1e9,
  'Charcutería': 0xc0392b,
  'Cerdo y carnes': 0xe74c3c,
  'Platos preparados': 0xf1c40f,
  'Zumos': 0x27ae60,
  'Frutas': 0x8fdb7c,
  'Verduras': 0x6fbb4f,
  // Congelado
  'Panadería congelada (bake-off)': 0xe59866,
  'Patatas y verduras congeladas': 0x58d68d,
  'Hielo': 0x7fb3d5,
  'Congelados pescado': 0x5dade2,
  'Congelados platos': 0x85929e,
  'Helados': 0xf1948a,
};

export function colorForFamily(family: string): number {
  return FAMILY_COLORS[family] ?? 0x1abc9c;
}

export function colorForStock(mode: StockColorMode, _sku: string, _temp: string, expiryDays: number, article: StockArticle): number {
  switch (mode) {
    case 'family':
      return FAMILY_COLORS[article.family] ?? 0xa8a29e;
    case 'rotation':
      return article.rotation === 'A' ? 0xe74c3c : article.rotation === 'B' ? 0xf5b301 : 0x3498db;
    case 'fefo':
      if (expiryDays <= 7) return 0xff5d5d;
      if (expiryDays <= 30) return 0xf5b301;
      return 0x2ecc71;
    case 'empty':
      return 0x2ecc71;
    case 'occupancy':
    default:
      return article.temp === 'Frío' ? 0x7cc4f0 : article.temp === 'Congelado' ? 0x9fd8ff : 0xb8a887;
  }
}