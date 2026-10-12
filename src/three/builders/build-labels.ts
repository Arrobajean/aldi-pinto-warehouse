import * as THREE from 'three';
import type { WarehouseLayout } from '@/lib/layout/types';

function makeTextTexture(text: string, opts: { font?: string; size?: number; color?: string; bg?: string | null; width?: number; height?: number }) {
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

function groundLabel(text: string, x: number, z: number, planeW: number, planeH: number, opts?: Parameters<typeof makeTextTexture>[1]): THREE.Mesh {
  const tex = makeTextTexture(text, { height: Math.round(planeH * 64), width: Math.round(planeW * 64), ...opts });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.045, z);
  return mesh;
}

export function buildLabels(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();

  const zoneLabels: { id: string; label: string; temp: string }[] = [
    { id: 'seco', label: 'SECO', temp: '16–22 ºC · picking nivel 0' },
    { id: 'frio', label: 'FRÍO', temp: '+2/+4 ºC' },
    { id: 'congelado', label: 'CONGELADO', temp: '−22/−25 ºC' },
    { id: 'fyv', label: 'FRUTAS Y VERDURAS', temp: '+6 ºC · 85–90 % HR' },
    { id: 'expedicion', label: 'EXPEDICIÓN', temp: 'consolidación y muelles' },
    { id: 'carga_baterias', label: 'CARGA DE BATERÍAS', temp: 'zona técnica' },
  ];

  for (const zl of zoneLabels) {
    if (zl.id === 'carga_baterias') continue; // la sala de carga lleva su propia etiqueta
    const zone = layout.zones.find((z) => z.id === zl.id);
    if (!zone) continue;
    const w = zone.rect.xMax - zone.rect.xMin;
    const cx = (zone.rect.xMin + zone.rect.xMax) / 2;
    const cz = (zone.rect.zMin + zone.rect.zMax) / 2;
    const planeW = Math.min(w - 10, 40);
    group.add(groundLabel(`${zl.label} — ${zl.temp}`, cx, cz, planeW, 3.4, { font: '700 42px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
  }

  for (const room of layout.rooms) {
    const r = room.rect;
    const cx = (r.xMin + r.xMax) / 2;
    const cz = room.kind === 'carga' ? (r.zMin + r.zMax) / 2 : r.zMax - 2.5;
    group.add(groundLabel(room.label, cx, cz, 18, 2.4, { font: '700 36px Plus Jakarta Sans, sans-serif', color: '#1c2e4a' }));
  }

  // Número de pasillo en cada cabecera (sur del pasillo, frente a Expedición).
  for (const aisle of layout.aisles) {
    const line = layout.rackLines.find((l) => l.aisleId === aisle.id && l.side === 'B');
    if (!line) continue;
    const front = line.segments[line.segments.length - 1].zEnd + 1.2;
    group.add(groundLabel(aisle.id, aisle.xCenter, front, 2.4, 0.75, { font: '700 30px JetBrains Mono, monospace', width: 256, height: 64, color: '#1c2e4a' }));
  }

  return group;
}