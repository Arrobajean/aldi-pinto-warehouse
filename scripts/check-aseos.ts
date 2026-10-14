import { buildPintoLayout } from '../src/lib/layout/pinto-layout';

// Aseos: pegados a la fachada (un lado coincide con el muro exterior) y con la puerta con 2 m de espacio libre
// (sin racks, salas, carriles, flejadoras ni otros aseos delante).
const layout = buildPintoLayout();
const fac = layout.building.rect;

type Box = { xMin: number; xMax: number; zMin: number; zMax: number };
const rackRects: Box[] = layout.rackLines.flatMap((rl) =>
  rl.segments.map((seg) => ({ xMin: rl.xCenter - rl.depth / 2, xMax: rl.xCenter + rl.depth / 2, zMin: seg.zStart, zMax: seg.zEnd })),
);
const blockers: Box[] = [
  ...rackRects,
  ...layout.docks.map((d) => d.laneRect),
  ...layout.strappers.map((s) => s.rect),
  ...layout.rooms.map((r) => r.rect),
  ...layout.restrooms.map((w) => w.rect),
];

const DIRS = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } } as const;
let flush = 0;
let doorsBlocked = 0;
for (const wc of layout.restrooms) {
  const r = wc.rect;
  if (r.xMin <= fac.xMin || r.xMax >= fac.xMax || r.zMin <= fac.zMin || r.zMax >= fac.zMax) flush++;

  const { side, at } = wc.door;
  const dir = DIRS[side];
  const x0 = side === 'e' ? r.xMax : side === 'w' ? r.xMin : at;
  const z0 = side === 'n' ? r.zMin : side === 's' ? r.zMax : at;
  let blocked = false;
  for (let d = 0.5; d <= 2.0; d += 0.25) {
    const px = x0 + dir.x * d;
    const pz = z0 + dir.z * d;
    if (px < fac.xMin + 0.5 || px > fac.xMax - 0.5 || pz < fac.zMin + 0.5 || pz > fac.zMax - 0.5) blocked = true;
    if (blockers.some((b) => px > b.xMin && px < b.xMax && pz > b.zMin && pz < b.zMax)) blocked = true;
  }
  if (blocked) doorsBlocked++;
}

console.log('Aseos pegados a la fachada:', flush, '/', layout.restrooms.length, '· puertas sin espacio libre delante:', doorsBlocked);
