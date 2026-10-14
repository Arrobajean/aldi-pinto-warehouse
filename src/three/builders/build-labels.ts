import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';
import type { ZoneId } from '@/lib/types';
import { FACE_V, dockU, faceXZ } from '@/lib/layout/dock-geometry';
import { ANNEX_COL_X, ANNEX_LANE_W, ANNEX_LANE_X, ANNEX_ROOM_ID, ROOM_ENTRANCE_Z } from '@/lib/layout/pinto-layout';
import { NAVE_FLOOR_H } from '@/three/builders/build-building';
import { aisleCategoryLabel } from '@/lib/stock/catalog';
import { colorForFamily } from '@/lib/stock/colors';
import { box, standard } from '@/three/builders/utils';

function makeTextTexture(text: string, opts: { font?: string; size?: number; color?: string; bg?: string | null; width?: number; height?: number }) {
  if (typeof document === 'undefined') return new THREE.Texture();
  const { font = '600 42px Plus Jakarta Sans, sans-serif', size = 42, color = '#12203a', bg = 'rgba(240,244,250,0.85)', width = 1024, height = 128 } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  if (bg) {
    ctx.fillStyle = bg;
    ctx.roundRect(8, 8, width - 16, height - 16, 18);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.font = font;
  const measure = ctx.measureText(text);
  const scale = Math.min(1, (width - 60) / measure.width);
  ctx.font = `${Math.round(size * scale)}px ${font.split('px ')[1] ?? 'sans-serif'}`;
  ctx.fillText(text, width / 2, height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Textura de alta definición para cartel de pasillo low-poly idéntico a image copy 9.png:
 * Placa rectangular con esquinas redondeadas, fondo del color temático de la familia de productos,
 * código de pasillo en blanco y negrita a la izquierda, y nombre de la categoría a la derecha.
 */
function makeAisleLowPolySignTexture(aisleId: string, category: string, badgeColor: string): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const width = 1024;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');

  ctx.clearRect(0, 0, width, height);

  const pad = 12;
  const cardW = width - pad * 2;
  const cardH = height - pad * 2;
  const r = 26;

  // Fondo del cartel con el color temático de la familia (idéntico a image copy 9.png)
  ctx.save();
  ctx.fillStyle = badgeColor;
  ctx.beginPath();
  ctx.roundRect(pad, pad, cardW, cardH, r);
  ctx.fill();

  // Borde interior blanco reflectante
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.stroke();

  // Borde exterior muy fino para perfilar contra cualquier fondo
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
  ctx.stroke();

  // Separador vertical sutil entre código de pasillo y nombre de categoría
  const badgeW = 280;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.beginPath();
  ctx.roundRect(pad + 10, pad + 10, badgeW, cardH - 20, 18);
  ctx.fill();

  // Línea divisoria vertical
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.moveTo(pad + badgeW + 24, pad + 20);
  ctx.lineTo(pad + badgeW + 24, pad + cardH - 20);
  ctx.stroke();

  // Código de pasillo (p. ej. 'S-13', 'F-02', 'C-01')
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 86px "JetBrains Mono", "Plus Jakarta Sans", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(aisleId, pad + 10 + badgeW / 2, height / 2 + 3);

  // Nombre de la categoría (p. ej. 'Limpieza y droguería', 'Bebidas y refrescos')
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 58px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  const textX = pad + badgeW + 48;
  const maxTextW = width - textX - 32;
  const measure = ctx.measureText(category);
  if (measure.width > maxTextW) {
    const scale = maxTextW / measure.width;
    ctx.font = `700 ${Math.max(34, Math.round(58 * scale))}px "Plus Jakarta Sans", sans-serif`;
  }
  ctx.fillText(category, textX, height / 2 + 3);

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface RackSignOptions {
  postMat: THREE.Material;
  frameMat: THREE.Material;
}

/**
 * Construye el cartel de pasillo low-poly montado físicamente en la estructura del rack:
 * Es un objeto del mundo 3D (THREE.Mesh con geometría BoxGeometry y materiales PBR estándar),
 * anclado directamente al puntal del rack con bridas y abrazaderas metálicas.
 *
 * Se orienta según la rotación del mundo 3D (objeto del mundo, no UI ni billboard en pantalla),
 * reaccionando a la perspectiva isométrica, giros de cámara, iluminación y sombras.
 */
function buildRackMountedSign(
  aisleId: string,
  category: string,
  texSign: THREE.Texture,
  postX: number,
  postY: number,
  postZ: number,
  rotationY: number,
  mats: RackSignOptions,
): THREE.Group {
  const g = new THREE.Group();
  g.name = `rack-sign-${aisleId}`;
  g.position.set(postX, postY, postZ);
  g.rotation.y = rotationY;

  const { postMat, frameMat } = mats;

  // 1. Abrazaderas y herrajes de fijación al puntal del rack (en Z = 0)
  // Collarines metálicos que abrazan el puntal vertical (sección 0.09 x 0.09)
  const collarUpperY = 0.18;
  const collarLowerY = -0.18;
  // Collarín superior
  g.add(box(0.14, 0.08, 0.14, postMat, 0, collarUpperY, 0));
  g.add(box(0.08, 0.06, 0.08, postMat, 0, collarUpperY, 0.04));
  // Collarín inferior
  g.add(box(0.14, 0.08, 0.14, postMat, 0, collarLowerY, 0));
  g.add(box(0.08, 0.06, 0.08, postMat, 0, collarLowerY, 0.04));

  // 2. Perfiles unistrut verticales de soporte traseros
  g.add(box(0.04, 0.65, 0.03, postMat, -0.45, 0, 0.04));
  g.add(box(0.04, 0.65, 0.03, postMat, 0.45, 0, 0.04));

  // 3. Cartel 3D volumétrico físico (objeto del mundo con grosor de 6 cm)
  const signW = 2.2;
  const signH = 0.65;
  const signD = 0.06;
  const signZ = 0.08; // situado justo por delante de las abrazaderas del puntal

  // Molduras perimetrales del marco de aluminio
  g.add(box(signW + 0.03, 0.03, signD + 0.015, frameMat, 0, signH / 2, signZ));
  g.add(box(signW + 0.03, 0.03, signD + 0.015, frameMat, 0, -signH / 2, signZ));
  g.add(box(0.03, signH, signD + 0.015, frameMat, -signW / 2, 0, signZ));
  g.add(box(0.03, signH, signD + 0.015, frameMat, signW / 2, 0, signZ));

  // Placa central con textura en caras +Z y -Z
  const faceMat = new THREE.MeshStandardMaterial({
    map: texSign,
    roughness: 0.35,
    metalness: 0.08,
  });
  const boardGeo = new THREE.BoxGeometry(signW, signH, signD);
  const boardMats: THREE.Material[] = [
    frameMat, // +X
    frameMat, // -X
    frameMat, // +Y
    frameMat, // -Y
    faceMat, // +Z (cara principal que mira hacia el pasillo / corredor exterior)
    faceMat, // -Z (cara posterior legible desde el interior)
  ];
  const boardMesh = new THREE.Mesh(boardGeo, boardMats);
  boardMesh.position.set(0, 0, signZ);
  boardMesh.castShadow = true;
  boardMesh.receiveShadow = true;
  boardMesh.userData = { type: 'aisle-sign', aisleId, category };
  g.add(boardMesh);

  return g;
}

/** Número de cada muelle (D01…D64) sobre su marquesina, legible desde la vista de la nave. */
export function buildDockLabels(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  group.name = 'dock-labels';
  for (const dock of layout.docks) {
    const tex = makeTextTexture(dock.id, {
      font: '700 72px JetBrains Mono, monospace',
      size: 72,
      color: '#ffffff',
      bg: 'rgba(28,46,74,0.92)',
      width: 256,
      height: 96,
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(3.2, 1.2, 1);
    // Sobre la marquesina (4,45 m) para no quedar dentro del remolque ni de la cubierta.
    const c = faceXZ(dock.face, dockU(dock), FACE_V[dock.face] + 1.2);
    sprite.position.set(c.x, 5.0, c.z);
    sprite.renderOrder = 3;
    group.add(sprite);
  }
  return group;
}

function groundLabel(text: string, x: number, z: number, planeW: number, planeH: number, opts?: Parameters<typeof makeTextTexture>[1]): THREE.Mesh {
  const tex = makeTextTexture(text, { height: Math.round(planeH * 64), width: Math.round(planeW * 64), ...opts });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, NAVE_FLOOR_H + 0.04, z);
  return mesh;
}

export function buildLabels(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();

  const zoneLabels: { id: ZoneId; label: string; temp: string }[] = [
    { id: 'seco', label: 'SECO', temp: '16–22 ºC · picking nivel 0' },
    { id: 'frio', label: 'FRÍO', temp: '+2/+4 ºC' },
    { id: 'congelado', label: 'CONGELADO', temp: '−22/−25 ºC' },
    { id: 'expedicion', label: 'EXPEDICIÓN', temp: 'consolidación y muelles' },
    { id: 'carga_baterias', label: 'CARGA DE BATERÍAS', temp: 'zona técnica' },
  ];

  const zoneMap = new Map(layout.zones.map((z) => [z.id, z]));
  for (const zl of zoneLabels) {
    if (zl.id === 'carga_baterias') continue; // la sala de carga lleva su propia etiqueta
    const zone = zoneMap.get(zl.id);
    if (!zone) continue;
    const w = zone.rect.xMax - zone.rect.xMin;
    const cx = (zone.rect.xMin + zone.rect.xMax) / 2;
    const cz = (zone.rect.zMin + zone.rect.zMax) / 2;
    const planeW = Math.min(w - 10, 40);
    group.add(groundLabel(`${zl.label} — ${zl.temp}`, cx, cz, planeW, 3.4, { font: '700 42px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
  }

  // Área de flejado y playa de consolidación de seco (antigua FyV en el suelo).
  if (layout.strappers.length > 0) {
    const xMin = Math.min(...layout.strappers.map((s) => s.rect.xMin));
    const xMax = Math.max(...layout.strappers.map((s) => s.rect.xMax));
    const zMin = Math.min(...layout.strappers.map((s) => s.rect.zMin));
    group.add(groundLabel('TRENES DE FLEJADO — entrada oeste · salida este', (xMin + xMax) / 2, zMin - 4, 22, 2.2, { font: '700 34px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
  }
  // Rótulo de cada playa junto a uno de sus bordes N/S, en el primer hueco libre del recuadro de entrega.
  const playaPoints = layout.consolidation.map((c) => c.dropPoint);
  for (const area of layout.consolidation) {
    const r = area.rect;
    const w = Math.min(15, (r.xMax - r.xMin) / 2 - 1);
    const spots = [
      { x: r.xMin + w / 2 + 0.5, z: r.zMin - 2.4 },
      { x: r.xMax - w / 2 - 0.5, z: r.zMin - 2.4 },
      { x: r.xMin + w / 2 + 0.5, z: r.zMax + 2.4 },
      { x: r.xMax - w / 2 - 0.5, z: r.zMax + 2.4 },
    ];
    const free = (sp: { x: number; z: number }) => playaPoints.every((p) => Math.abs(p.x - sp.x) > w / 2 + 1.6 || Math.abs(p.z - sp.z) > 2.4);
    const at = spots.find(free) ?? spots[0];
    group.add(groundLabel(area.label.toUpperCase(), at.x, at.z, w, 2.2, { font: '700 36px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
    group.add(groundLabel('ENTREGA', area.dropPoint.x, area.dropPoint.z, 2.6, 0.9, { font: '700 30px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
    for (const lane of area.lanes) {
      group.add(groundLabel(lane.id.slice(-2), lane.x + lane.dirX * 0.9, lane.z + lane.dirZ * 0.9, 1.1, 0.8, { font: '700 40px Plus Jakarta Sans, sans-serif', color: '#7a3d00' }));
    }
  }

  for (const room of layout.rooms) {
    const r = room.rect;
    if (room.id === ANNEX_ROOM_ID) {
      // Sala anexa: rótulo centrado entre las dos calles de acceso, en el suelo libre entre las plazas y la calle de la puerta.
      const lastBayZ = Math.max(...room.spots.map((s) => s.z)) + 1.05;
      const doorLaneZ = ROOM_ENTRANCE_Z - ANNEX_LANE_W / 2;
      const cxAnnex = (Math.min(...ANNEX_COL_X) + Math.max(...ANNEX_LANE_X)) / 2;
      group.add(groundLabel(room.label, cxAnnex, (lastBayZ + doorLaneZ) / 2, 18, 2.4, { font: '700 36px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
      continue;
    }
    const cx = (r.xMin + r.xMax) / 2;
    const cz = (r.zMin + r.zMax) / 2;
    group.add(groundLabel(room.label, cx, cz, 18, 2.4, { font: '700 36px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
  }

  // Carriles de la garita: entrada (z = 178, hacia el oeste) y salida (z = 170, hacia el este), cada uno con su barrera.
  const laneOpts = { font: '700 30px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' };
  group.add(groundLabel('ENTRADA', 252, 183, 12, 2.2, laneOpts));
  group.add(groundLabel('SALIDA', 252, 164, 12, 2.2, laneOpts));

  // Materiales estructurales compartidos para los carteles low-poly colocados en los racks
  const postMat = standard(0x64748b, { roughness: 0.55, metalness: 0.35 });
  const frameMat = standard(0x1e293b, { roughness: 0.65, metalness: 0.3 });
  const signMats: RackSignOptions = { postMat, frameMat };

  // Señalización completa de pasillos: carteles 3D colocados en los racks y marcas viales en suelo.
  for (const aisle of layout.aisles) {
    const line = layout.rackLines.find((l) => l.aisleId === aisle.id && l.side === 'B');
    if (!line || line.segments.length === 0) continue;
    const firstSeg = line.segments[0];
    const lastSeg = line.segments[line.segments.length - 1];
    const category = aisleCategoryLabel(aisle.id);
    const colorInt = colorForFamily(category.split(' / ')[0] ?? '');
    const colorHex = '#' + colorInt.toString(16).padStart(6, '0');

    // Textura compartida para el cartel de ambas cabeceras
    const texSign = makeAisleLowPolySignTexture(aisle.id, category, colorHex);
    const signY = NAVE_FLOOR_H + 2.85;

    // 1. Cartel 3D colocado en el rack en cabecera Sur (objeto del mundo, montado en el puntal del rack)
    group.add(buildRackMountedSign(aisle.id, category, texSign, line.xCenter, signY, lastSeg.zEnd, 0, signMats));

    // 2. Cartel 3D colocado en el rack en cabecera Norte (objeto del mundo, montado en el puntal del rack)
    group.add(buildRackMountedSign(aisle.id, category, texSign, line.xCenter, signY, firstSeg.zStart, Math.PI, signMats));

    // 3. Pintura vial en el suelo en ambas cabeceras, dentro del pasillo (no sobre la calle norte, transversal o spine)
    group.add(
      groundLabel(`${aisle.id} · ${category.toUpperCase()}`, aisle.xCenter, lastSeg.zEnd - 1.2, 3.4, 0.8, {
        font: '700 28px JetBrains Mono, monospace',
        width: 440,
        height: 96,
        color: '#ffffff',
        bg: colorHex,
      }),
    );
    group.add(
      groundLabel(`${aisle.id} · ${category.toUpperCase()}`, aisle.xCenter, firstSeg.zStart + 1.2, 3.4, 0.8, {
        font: '700 28px JetBrains Mono, monospace',
        width: 440,
        height: 96,
        color: '#ffffff',
        bg: colorHex,
      }),
    );
  }

  // Aseos: etiqueta de suelo y cartel WC sobre cada puerta.
  const outward = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } };
  for (const wc of layout.restrooms) {
    const r = wc.rect;
    group.add(groundLabel(wc.label, (r.xMin + r.xMax) / 2, (r.zMin + r.zMax) / 2, 6, 1.5, { font: '700 36px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));

    const { side, at } = wc.door;
    const doorX = side === 'e' ? r.xMax : side === 'w' ? r.xMin : at;
    const doorZ = side === 'n' ? r.zMin : side === 's' ? r.zMax : at;
    const tex = makeTextTexture('WC', { font: '700 72px JetBrains Mono, monospace', size: 72, color: '#ffffff', bg: 'rgba(28,46,74,0.92)', width: 256, height: 96 });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(2.2, 0.8, 1);
    sprite.position.set(doorX + outward[side].x * 0.8, NAVE_FLOOR_H + 2.6, doorZ + outward[side].z * 0.8);
    sprite.renderOrder = 3;
    group.add(sprite);
  }

  return group;
}
