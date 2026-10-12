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
  'Conservas': 0xd8b45a,
  'Bebidas': 0x4aa3df,
  'Bazar': 0xb48ad9,
  'Legumbres': 0xb0875a,
  'Aceites y salsas': 0xd9a441,
  'Lácteos': 0x9fd8ef,
  'Cerdo y carnes': 0xe09a7b,
  'Zumos': 0x8fd694,
  'Congelados pescado': 0x9cc7ee,
  'Congelados platos': 0xa9b8c9,
  'Helados': 0xcad6e6,
  'Frutas': 0x8fdb7c,
  'Verduras': 0x6fbb4f,
};

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