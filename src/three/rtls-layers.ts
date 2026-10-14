import * as THREE from 'three';
import type { Rect, WarehouseLayout } from '@/lib/layout/types';
import type { SmoothedTrack } from '@/lib/rtls/types';

interface TrailLine {
  line: THREE.Line;
  points: { x: number; z: number; ts: number }[];
}

/**
 * Capas de localización: rastro por máquina y mapa de calor de tráfico
 * (textura en el suelo que acumula densidad).
 */
export class RtlsLayers {
  readonly group = new THREE.Group();
  private trails = new Map<string, TrailLine>();
  private heatCanvas: HTMLCanvasElement;
  private heatTexture: THREE.CanvasTexture;
  private heatMesh: THREE.Mesh;
  private grid: Float32Array;
  private gridW: number;
  private gridH: number;
  private bounds: Rect;
  private lastDecay = 0;
  private mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  constructor(layout: WarehouseLayout) {
    this.bounds = layout.parcel;
    const scale = 256;
    this.gridW = scale;
    this.gridH = scale;
    this.grid = new Float32Array(scale * scale);

    const w = this.bounds.xMax - this.bounds.xMin;
    const d = this.bounds.zMax - this.bounds.zMin;
    this.heatCanvas = document.createElement('canvas');
    this.heatCanvas.width = scale;
    this.heatCanvas.height = scale;
    this.heatTexture = new THREE.CanvasTexture(this.heatCanvas);
    this.heatTexture.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(w, d);
    this.heatMesh = new THREE.Mesh(geo, this.mat);
    this.heatMesh.rotation.x = -Math.PI / 2;
    this.heatMesh.position.set((this.bounds.xMin + this.bounds.xMax) / 2, 0.02, (this.bounds.zMin + this.bounds.zMax) / 2);
    this.heatMesh.name = 'rtls-heatmap';
    this.heatMesh.visible = true;
    this.group.add(this.heatMesh);
  }

  setVisibleHeatmap(v: boolean) {
    this.heatMesh.visible = v;
  }

  setVisibleTrails(v: boolean) {
    for (const t of this.trails.values()) t.line.visible = v;
  }

  private toGrid(x: number, z: number): [number, number] {
    const nx = (x - this.bounds.xMin) / (this.bounds.xMax - this.bounds.xMin);
    const nz = 1 - (z - this.bounds.zMin) / (this.bounds.zMax - this.bounds.zMin);
    return [
      Math.max(0, Math.min(this.gridW - 1, Math.floor(nx * this.gridW))),
      Math.max(0, Math.min(this.gridH - 1, Math.floor(nz * this.gridH))),
    ];
  }

  /** Acumula densidad por la posición filtrada de cada máquina. */
  accumulate(tracks: Map<string, SmoothedTrack>) {
    for (const t of tracks.values()) {
      const [gx, gy] = this.toGrid(t.x, t.z);
      const idx = gy * this.gridW + gx;
      this.grid[idx] = Math.min(1, this.grid[idx] + 0.03);
      // pequeña difusión al vecindario
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ni = (gy + dy) * this.gridW + (gx + dx);
          if (ni < 0 || ni >= this.grid.length) continue;
          this.grid[ni] = Math.min(1, this.grid[ni] + 0.012);
        }
      }
    }
  }

  private heatImg: ImageData | null = null;

  private renderHeatMap() {
    const ctx = this.heatCanvas.getContext('2d');
    if (!ctx) return;
    if (!this.heatImg) this.heatImg = ctx.createImageData(this.gridW, this.gridH);
    const img = this.heatImg;
    for (let i = 0; i < this.grid.length; i++) {
      const v = this.grid[i];
      const r = Math.min(255, Math.floor(255 * v));
      const g = Math.min(255, Math.floor(120 * v));
      const b = Math.min(255, Math.floor(60 * v));
      const a = Math.min(200, Math.floor(200 * v));
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    this.heatTexture.needsUpdate = true;
  }

  /** Rastros de los últimos minutos por máquina. */
  updateTrails(tracks: Map<string, SmoothedTrack>) {
    const keepWindow = 60; // segundos de rastro
    const seen = new Set<string>();
    for (const track of tracks.values()) {
      seen.add(track.tagId);
      const recent = track.samples.filter((s) => track.lastTs - s.ts <= keepWindow);
      if (recent.length < 2) continue;
      let trail = this.trails.get(track.tagId);
      if (!trail) {
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(keepWindow * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.LineBasicMaterial({ color: 0x22a6e0, transparent: true, opacity: 0.7 });
        const line = new THREE.Line(geo, mat);
        line.name = `trail-${track.tagId}`;
        line.frustumCulled = false;
        this.group.add(line);
        trail = { line, points: recent.map((s) => ({ x: s.x, z: s.z, ts: s.ts })) };
        this.trails.set(track.tagId, trail);
      } else {
        trail.points = recent.map((s) => ({ x: s.x, z: s.z, ts: s.ts }));
      }
      const pos = trail.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < keepWindow; i++) {
        const pt = trail.points[i];
        if (pt) {
          pos.setXYZ(i, pt.x, 0.05, pt.z);
        } else {
          pos.setXYZ(i, 0, -100, 0);
        }
      }
      pos.needsUpdate = true;
      trail.line.geometry.setDrawRange(0, keepWindow);
    }
    for (const [tagId, trail] of this.trails) {
      if (!seen.has(tagId)) {
        trail.line.geometry.setDrawRange(0, 0);
      }
    }
  }

  /** Actualización periódica del calor (con decaimiento suave). */
  update(now: number, tracks: Map<string, SmoothedTrack>) {
    this.updateTrails(tracks);
    const dt = now - this.lastDecay;
    if (dt > 1) {
      this.lastDecay = now;
      for (let i = 0; i < this.grid.length; i++) this.grid[i] *= 0.97;
      this.renderHeatMap();
    }
  }

  dispose() {
    this.heatTexture.dispose();
    this.heatMesh.geometry.dispose();
    this.mat.dispose();
    for (const t of this.trails.values()) {
      t.line.geometry.dispose();
      (t.line.material as THREE.Material).dispose();
    }
    this.trails.clear();
  }
}