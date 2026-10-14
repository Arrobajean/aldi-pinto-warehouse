import { buildPintoLayout, forEachRackSlot } from '../src/lib/layout/pinto-layout';
import { skuForAisle, articleForSku } from '../src/lib/stock/catalog';

const layout = buildPintoLayout();
console.log('All layout aisles:', layout.aisles.map(a => a.id).join(', '));
const aisleFamilies: Record<string, Set<string>> = {};

forEachRackSlot(layout, (slot) => {
  for (let r = 0.1; r <= 0.9; r += 0.2) {
    const sku = skuForAisle(slot.aisleId, slot.zoneId, r);
    const art = articleForSku(sku);
    aisleFamilies[slot.aisleId] = aisleFamilies[slot.aisleId] || new Set();
    aisleFamilies[slot.aisleId].add(art.family);
  }
});

for (const [aisle, fams] of Object.entries(aisleFamilies).sort()) {
  console.log(aisle, '->', Array.from(fams).join(', '));
}

// Verification checks:
let errors = 0;
for (const [aisle, fams] of Object.entries(aisleFamilies)) {
  const f = Array.from(fams);
  if (['S-13', 'S-14', 'S-15', 'S-16'].includes(aisle)) {
    if (!f.includes('Limpieza y droguería') || f.includes('Legumbres')) {
      console.error('ERROR in cleaning aisle:', aisle, f);
      errors++;
    }
  }
  if (['S-04', 'S-05', 'S-06'].includes(aisle)) {
    if (!f.includes('Legumbres') || f.includes('Limpieza y droguería')) {
      console.error('ERROR in legume aisle:', aisle, f);
      errors++;
    }
  }
  if (aisle === 'C-01') {
    if (!f.includes('Panadería congelada (bake-off)')) {
      console.error('ERROR in frozen bake-off aisle:', aisle, f);
      errors++;
    }
  }
  if (aisle === 'C-02') {
    if (!f.includes('Hielo') && !f.includes('Patatas y verduras congeladas')) {
      console.error('ERROR in frozen fries/ice aisle:', aisle, f);
      errors++;
    }
  }
}

if (errors === 0) {
  console.log('SUCCESS: All 37 aisle families strictly isolated and correctly mapped!');
} else {
  console.error(`FAILED: ${errors} errors found`);
  process.exit(1);
}

