import * as THREE from 'three';
import type { Strapper } from '@/lib/layout/types';
import { box, lambert, plane } from '@/three/builders/utils';
import { NAVE_FLOOR_H } from '@/three/builders/build-building';
import { MARK_Y, paintOutline, SAFETY_YELLOW } from '@/three/builders/floor';

function makeStrapperBadgeTexture(id: string, name: string): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const width = 1024;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, width, height);

  // Background panel: deep navy industrial tag
  ctx.fillStyle = '#0b162c';
  ctx.beginPath();
  ctx.roundRect(12, 12, width - 24, height - 24, 28);
  ctx.fill();

  // ALDI orange border
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#f39200';
  ctx.stroke();

  // Left badge for ID
  ctx.fillStyle = '#f39200';
  ctx.beginPath();
  ctx.roundRect(24, 24, 320, height - 48, 18);
  ctx.fill();

  // Machine ID text
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 78px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(id, 184, height / 2);

  // Right description text
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 50px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(name.toUpperCase(), 370, height / 2 - 14);

  // Status subtitle
  ctx.fillStyle = '#10b981'; // emerald green
  ctx.font = '600 32px system-ui, sans-serif';
  ctx.fillText('● EN SERVICIO · AUTOMÁTICO', 370, height / 2 + 36);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildStrapperMesh(strapper: Strapper): THREE.Group {
  const group = new THREE.Group();
  group.name = `strapper-${strapper.id}`;
  group.userData.strapperId = strapper.id;

  const r = strapper.rect;
  const w = r.xMax - r.xMin;
  const d = r.zMax - r.zMin;
  const cx = (r.xMin + r.xMax) / 2;
  const cz = (r.zMin + r.zMax) / 2;

  // Montado sobre el piso de la nave (a 1,2 m de cota cero)
  group.position.set(cx, NAVE_FLOOR_H, cz);

  const chassisMat = lambert(0x2a3442);
  const rollerMat = lambert(0x64748b);
  const steelRollerMat = lambert(0x94a3b8);
  const aldiOrange = lambert(0xf39200);
  const aldiNavy = lambert(0x001e50);

  // 1. Patas de soporte estructurales cada 2.5 m desde el suelo hasta la mesa
  for (let x = -w / 2 + 1.2; x <= w / 2 - 1.0; x += 2.5) {
    group.add(box(0.12, 0.5, 1.4, chassisMat, x, 0.25, 0));
  }

  // 2. Bancada y camino de rodillos continuo (conveyor de 20 m)
  // Bancada principal
  group.add(box(w, 0.12, 1.5, chassisMat, 0, 0.44, 0));
  // Cama de rodillos
  group.add(box(w, 0.08, 1.35, rollerMat, 0, 0.54, 0));
  // Rodillos metálicos individuales a lo largo de toda la vía
  for (let rx = -w / 2 + 0.3; rx <= w / 2 - 0.3; rx += 0.5) {
    group.add(box(0.04, 0.05, 1.3, steelRollerMat, rx, 0.585, 0));
  }

  // Guías laterales de centrado en naranja ALDI
  for (const s of [-1, 1]) {
    group.add(box(w, 0.14, 0.08, aldiOrange, 0, 0.65, s * 0.72));
  }

  // 3. Pórtico de flejado automático en el centro del tren.
  // Paso libre: los rodillos llegan a 0,61 m y el palé mide 1,6 m (PALLET_HEIGHT), luego su cara superior queda a
  // 2,21 m. El cabezal cuelga con su cara inferior a 2,41 m: 1,80 m sobre los rodillos, 0,20 m de holgura sobre el palé.
  const postLeft = box(0.35, 3.325, 0.35, aldiOrange, 0, 1.6625, -1.05);
  const postRight = box(0.35, 3.325, 0.35, aldiOrange, 0, 1.6625, 1.05);
  const topBridge = box(0.65, 0.35, 2.45, aldiOrange, 0, 3.15, 0);
  group.add(postLeft, postRight, topBridge);

  // Cabezal de flejado y sellado térmico (azul marino ALDI): de 2,41 a 2,96 m, bajo el puente (cara inferior 2,975 m)
  group.add(box(0.9, 0.55, 1.1, aldiNavy, 0, 2.685, 0));

  // Baliza de estado (verde / en servicio)
  const beaconStem = box(0.08, 0.3, 0.08, lambert(0x1e293b), 0, 3.475, 0);
  const beaconLight = box(0.2, 0.25, 0.2, lambert(0x10b981), 0, 3.75, 0);
  group.add(beaconStem, beaconLight);

  // 4. Marcas perimetrales en el suelo en entrada y salida (a cota MARK_Y sobre el piso de la nave)
  const inDx = strapper.input.x - cx;
  const inDz = strapper.input.z - cz;
  paintOutline(group, inDx - 1.5, inDx + 1.5, inDz - 1.2, inDz + 1.2, SAFETY_YELLOW, 0.15, MARK_Y);

  const outDx = strapper.output.x - cx;
  const outDz = strapper.output.z - cz;
  paintOutline(group, outDx - 1.5, outDx + 1.5, outDz - 1.2, outDz + 1.2, SAFETY_YELLOW, 0.15, MARK_Y);

  // 5. Cartel superior identificativo
  const badgeTex = makeStrapperBadgeTexture(strapper.id, 'Tren de Flejado');
  const badgeMat = new THREE.MeshBasicMaterial({
    map: badgeTex,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const signMesh = plane(4.2, 1.05, badgeMat, 0, 4.25, 0, 0);
  group.add(signMesh);

  // 6. Resalte de selección
  const highlightGeo = new THREE.BoxGeometry(w + 1.5, 0.05, d + 1.5);
  const highlightMat = new THREE.MeshBasicMaterial({
    color: 0x22a6e0,
    wireframe: true,
    transparent: true,
    opacity: 0.85,
  });
  const highlightMesh = new THREE.Mesh(highlightGeo, highlightMat);
  highlightMesh.name = 'selection-highlight';
  highlightMesh.position.set(0, 0.03, 0);
  highlightMesh.visible = false;
  group.add(highlightMesh);

  return group;
}
