import * as THREE from 'three';
import type { Rect, WarehouseLayout } from '@/lib/layout/types';
import { box, lambert, plane } from '@/three/builders/utils';

export interface WallMesh {
  mesh: THREE.Mesh;
  /** Altura máxima del muro (con modo 'up'). */
  fullTop: number;
  /** Normal exterior del muro (0,0,±1 o ±1,0,0). */
  normal: { x: number; z: number };
}

export interface BuildingModel {
  group: THREE.Group;
  outerWalls: WallMesh[];
  innerWalls: WallMesh[];
}

const WALL_THICKNESS = 0.4;
const ZONE_FLOOR_ALPHA = 0.92;

function segmentsWithHoles(xMin: number, xMax: number, holes: { xMin: number; xMax: number }[], step = 0.25): { xMin: number; xMax: number }[] {
  const segs: { xMin: number; xMax: number }[] = [];
  let start = xMin;
  for (let x = xMin; x <= xMax + step; x += step) {
    const inside = holes.some((h) => x >= h.xMin && x <= h.xMax);
    if (inside) {
      if (x - start > step) segs.push({ xMin: start, xMax: x });
      start = x + step;
    }
  }
  if (xMax - start > step) segs.push({ xMin: start, xMax: xMax });
  return segs;
}

function buildZoneFloors(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  const zoneColors: Record<string, number> = {
    seco: 0xc9ced6,
    frio: 0x8fd0f2,
    congelado: 0xbde6ff,
    fyv: 0xa2e2a4,
    expedicion: 0xd2d7e0,
    carga_baterias: 0x9aa3b5,
  };

  for (const zone of layout.zones) {
    const w = zone.rect.xMax - zone.rect.xMin;
    const d = zone.rect.zMax - zone.rect.zMin;
    const cx = (zone.rect.xMin + zone.rect.xMax) / 2;
    const cz = (zone.rect.zMin + zone.rect.zMax) / 2;
    const mat = lambert(zoneColors[zone.id] ?? 0xbbbbbb);
    mat.transparent = true;
    mat.opacity = ZONE_FLOOR_ALPHA;
    // El suelo semitransparente no escribe profundidad: evita parpadeos con las marcas de encima.
    mat.depthWrite = false;
    const floor = plane(w, d, mat, cx, 0.02, cz);
    floor.name = `floor-${zone.id}`;
    floor.userData.zoneId = zone.id;
    floor.userData.zone = zone;
    group.add(floor);
  }

  // Salas de carga y de reposo: suelo propio y plazas marcadas (cargadores en la sala de carga).
  for (const room of layout.rooms) {
    const r = room.rect;
    const roomColor = room.kind === 'carga' ? 0xffd23f : 0xbcd9ee;
    const roomMat = lambert(roomColor, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const floor = plane(r.xMax - r.xMin, r.zMax - r.zMin, roomMat, (r.xMin + r.xMax) / 2, 0.035, (r.zMin + r.zMax) / 2);
    floor.receiveShadow = false;
    floor.name = `room-${room.id}`;
    group.add(floor);

    const spotMat = lambert(room.kind === 'carga' ? 0xffe98a : 0xe9f3fb, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const spot of room.spots) {
      const marker = plane(2.2, room.kind === 'carga' ? 2.2 : 2.6, spotMat, spot.x, 0.045, spot.z);
      marker.receiveShadow = false;
      group.add(marker);
      if (room.kind === 'carga') {
        // Cargador: columna con el cable (volumen simple).
        const charger = box(0.9, 1.4, 0.5, lambert(0x2a3550), spot.x, 0.7, spot.z - 0.9);
        group.add(charger);
      }
    }
  }

  // Flejadoras automáticas: cuerpo de la máquina y entrada/salida marcadas.
  for (const st of layout.strappers) {
    const r = st.rect;
    const cx = (r.xMin + r.xMax) / 2;
    const cz = (r.zMin + r.zMax) / 2;
    group.add(box(r.xMax - r.xMin, 1.4, r.zMax - r.zMin, lambert(0x3c4a63), cx, 0.7, cz));
    group.add(box(r.xMax - r.xMin - 1, 0.1, 1.2, lambert(0xf39200), cx, 1.45, cz));
    for (const port of [st.input, st.output]) {
      const mark = plane(3, 2.4, lambert(0xffd23f, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), port.x, 0.045, port.z);
      mark.receiveShadow = false;
      group.add(mark);
    }
  }

  // Calles de pre-carga de cada muelle en Expedición.
  // polygonOffset: las marcas se pintan sobre el suelo sin z-fighting (parpadeo de texturas).
  const laneMat = lambert(0xf5c542, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const dock of layout.docks) {
    const lane = plane(dock.laneRect.xMax - dock.laneRect.xMin, dock.laneRect.zMax - dock.laneRect.zMin, laneMat, dock.x, 0.04, (dock.laneRect.zMin + dock.laneRect.zMax) / 2);
    lane.receiveShadow = false;
    lane.rotation.x = -Math.PI / 2;
    lane.userData.dockId = dock.id;
    group.add(lane);
  }

  // Pasillos transversales: pintura más clara.
  const crossMat = lambert(0xe7ebf2, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const ca of layout.crossAisles) {
    const a = plane(ca.xMax - ca.xMin, ca.zMax - ca.zMin, crossMat, (ca.xMin + ca.xMax) / 2, 0.03, (ca.zMin + ca.zMax) / 2);
    a.receiveShadow = false;
    group.add(a);
  }

  return group;
}

function verticalSegments(_width: number, from: number, to: number, wallFull: number, mat: THREE.Material, holes: { xMin: number; xMax: number }[]): WallMesh[] {
  const walls: WallMesh[] = [];
  for (const seg of segmentsWithHoles(from, to, holes)) {
    const cx = (seg.xMin + seg.xMax) / 2;
    const w = seg.xMax - seg.xMin;
    const mesh = box(w, 1, WALL_THICKNESS, mat, cx, wallFull / 2, 0);
    walls.push({ mesh, fullTop: wallFull, normal: { x: 0, z: 1 } });
  }
  return walls;
}

function horizontalSegments(_depth: number, from: number, to: number, wallFull: number, mat: THREE.Material, holes: { xMin: number; xMax: number }[]): WallMesh[] {
  const walls: WallMesh[] = [];
  for (const seg of segmentsWithHoles(from, to, holes)) {
    const cz = (seg.xMin + seg.xMax) / 2;
    const d = seg.xMax - seg.xMin;
    const mesh = box(WALL_THICKNESS, 1, d, mat, 0, wallFull / 2, cz);
    walls.push({ mesh, fullTop: wallFull, normal: { x: 1, z: 0 } });
  }
  return walls;
}

function buildOuterWalls(layout: WarehouseLayout): WallMesh[] {
  const { rect, freeHeight } = layout.building;
  const mat = lambert(0xdfe6ee);
  const matSouth = lambert(0xd5dce7);
  const walls: WallMesh[] = [];

  // Fachada sur con los huecos de los muelles.
  const dockHoles = layout.docks.map((d) => ({ xMin: d.x - d.doorWidth / 2, xMax: d.x + d.doorWidth / 2 }));
  const south = horizontalSegments(WALL_THICKNESS, rect.xMin, rect.xMax, freeHeight, matSouth, dockHoles);
  for (const w of south) {
    w.normal = { x: 0, z: 1 };
    w.mesh.position.z = rect.zMax;
  }
  walls.push(...south);

  const north = horizontalSegments(WALL_THICKNESS, rect.xMin, rect.xMax, freeHeight, mat, []);
  for (const w of north) {
    w.normal = { x: 0, z: -1 };
    w.mesh.position.z = rect.zMin;
  }
  walls.push(...north);

  const west = verticalSegments(WALL_THICKNESS, rect.zMin, rect.zMax, freeHeight, mat, []);
  for (const w of west) {
    w.normal = { x: -1, z: 0 };
    w.mesh.position.x = rect.xMin;
  }
  walls.push(...west);

  const east = verticalSegments(WALL_THICKNESS, rect.zMin, rect.zMax, freeHeight, mat, []);
  for (const w of east) {
    w.normal = { x: 1, z: 0 };
    w.mesh.position.x = rect.xMax;
  }
  walls.push(...east);

  return walls;
}

function buildInnerWalls(layout: WarehouseLayout): WallMesh[] {
  const walls: WallMesh[] = [];
  const cameraPanels = lambert(0xc9d4e6);

  // Tabique x=30 (seco | frío / fyV), con puertas hacia fyV y Expedición.
  const w1 = verticalSegments(WALL_THICKNESS, -80, 50, 9.5, cameraPanels, [
    { xMin: -32.5, xMax: -18 },
    { xMin: 45, xMax: 50 },
  ]);
  for (const w of w1) w.mesh.position.x = 30;
  walls.push(...w1);

  // Límite sur de Frío / norte de fyV y Congelado: z=−25.
  const w2 = horizontalSegments(WALL_THICKNESS, 30, 125, 9.5, cameraPanels, [
    { xMin: 30, xMax: 36 },
    { xMin: 66, xMax: 72 },
  ]);
  for (const w of w2) w.mesh.position.z = -25;
  walls.push(...w2);

  // Tabique x=70 (fyV | congelado), con puerta y salida.
  const w3 = verticalSegments(WALL_THICKNESS, -25, 50, 9.5, cameraPanels, [
    { xMin: 0, xMax: 5 },
    { xMin: 47, xMax: 50 },
  ]);
  for (const w of w3) w.mesh.position.x = 70;
  walls.push(...w3);

  // Banda baja z=50 hacia Expedición: pasillos que atraviesan las máquinas.
  const w4 = horizontalSegments(WALL_THICKNESS, -125, 125, 3.0, cameraPanels, layout.docks.map((d) => ({ xMin: d.x - 1.5, xMax: d.x + 1.5 })));
  for (const w of w4) w.mesh.position.z = 50;
  walls.push(...w4);

  return walls;
}

function buildDockFurniture(layout: WarehouseLayout): THREE.Group {
  const group = new THREE.Group();
  const shelterMat = lambert(0x39465a);
  const levelerMat = lambert(0x7a8797);
  const frameMat = lambert(0x27303f);

  for (const dock of layout.docks) {
    const cx = dock.x;
    // Abrigo (shelter) oscuro alrededor de la puerta, en el exterior.
    const top = box(3.2, 0.25, 0.5, shelterMat, cx, 2.9, 80.25);
    const sideL = box(0.25, 2.9, 0.5, shelterMat, cx - 1.6, 1.45, 80.25);
    const sideR = box(0.25, 2.9, 0.5, shelterMat, cx + 1.6, 1.45, 80.25);
    group.add(top, sideL, sideR);

    // Niveladora interior (rampa hacia Expedición).
    const leveler = box(2.6, 0.12, dock.levelerDepth, levelerMat, cx, 0.06, 77.2);
    group.add(leveler);

    // Marco de la puerta.
    const frameTop = box(3.0, 0.2, 0.2, frameMat, cx, 2.6, 80.1);
    const frameEdge = box(0.2, 2.6, 0.2, frameMat, cx - 1.5, 1.3, 80.1);
    const frameEdge2 = box(0.2, 2.6, 0.2, frameMat, cx + 1.5, 1.3, 80.1);
    group.add(frameTop, frameEdge, frameEdge2);
  }

  return group;
}

export function buildBuilding(layout: WarehouseLayout): BuildingModel {
  const group = new THREE.Group();
  group.add(buildZoneFloors(layout));
  const outerWalls = buildOuterWalls(layout);
  const innerWalls = buildInnerWalls(layout);

  for (const w of outerWalls) group.add(w.mesh);
  for (const w of innerWalls) group.add(w.mesh);

  group.add(buildDockFurniture(layout));

  return { group, outerWalls, innerWalls };
}

export function rectCenter(r: Rect) {
  return { x: (r.xMin + r.xMax) / 2, z: (r.zMin + r.zMax) / 2 };
}