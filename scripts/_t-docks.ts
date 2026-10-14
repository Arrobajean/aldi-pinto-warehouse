import { buildPintoLayout } from '../src/lib/layout/pinto-layout';
const layout = buildPintoLayout();
for (const d of layout.docks) console.log(d.id, d.index, d.temp, d.kind, (d as any).x?.toFixed?.(1), (d as any).z?.toFixed?.(1));
