import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
import { buildSectionIndex } from '../src/lib/sim/sections';
const l = buildPintoLayout();
console.log('spots', l.rooms.filter((r) => r.kind === 'reposo').flatMap((r) => r.spots).length);
console.log(JSON.stringify(buildSectionIndex(l).sectionsByTemp));
