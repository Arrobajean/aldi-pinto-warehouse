import * as THREE from 'three';

export type SimsZoomLevel = 1 | 2 | 3;

export class SimsCameraController {
  public camera: THREE.OrthographicCamera;
  private targetAngleIndex: number = 0;
  private currentRotationAngle: number = Math.PI * 0.25; // 45 deg base
  private targetRotationAngle: number = Math.PI * 0.25;

  private currentZoomLevel: SimsZoomLevel = 2; // Default medium zoom
  private targetZoom: number = 18;
  private currentZoom: number = 18;

  public targetLookAt: THREE.Vector3 = new THREE.Vector3(0, 2, 0);
  public currentLookAt: THREE.Vector3 = new THREE.Vector3(0, 2, 0);

  private readonly distance: number = 150;
  private readonly pitchAngle: number = Math.atan(1 / Math.SQRT2); // ~35.264 degrees (true isometric)

  // Zoom definitions for 3 levels (Sims 1)
  private readonly zoomMap: Record<SimsZoomLevel, number> = {
    1: 30, // Close-up (detail of forklift / picker)
    2: 17, // Medium (zone level)
    3: 9,  // Far (entire logistic platform overview)
  };

  // Drag panning support
  private isDragging: boolean = false;
  private previousMousePosition = { x: 0, y: 0 };

  constructor(width: number, height: number) {
    const aspect = width / height;
    const frustumSize = 40;

    this.camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );

    this.targetZoom = this.zoomMap[this.currentZoomLevel];
    this.currentZoom = this.targetZoom;
    this.camera.zoom = this.currentZoom;
    this.updateCameraPosition();
  }

  public rotateClockwise(): number {
    this.targetAngleIndex = (this.targetAngleIndex + 1) % 4;
    this.targetRotationAngle += Math.PI * 0.5;
    return this.targetAngleIndex;
  }

  public rotateCounterClockwise(): number {
    this.targetAngleIndex = (this.targetAngleIndex + 3) % 4;
    this.targetRotationAngle -= Math.PI * 0.5;
    return this.targetAngleIndex;
  }

  public setZoomLevel(level: SimsZoomLevel): void {
    this.currentZoomLevel = level;
    this.targetZoom = this.zoomMap[level];
  }

  public getZoomLevel(): SimsZoomLevel {
    return this.currentZoomLevel;
  }

  public getAngleIndex(): number {
    return this.targetAngleIndex;
  }

  public focusOnZone(zone: 'seco' | 'frio' | 'congelado' | 'muelles' | 'all'): void {
    switch (zone) {
      case 'seco':
        this.targetLookAt.set(-16, 2, -2);
        this.setZoomLevel(2);
        break;
      case 'frio':
        this.targetLookAt.set(10, 2, -2);
        this.setZoomLevel(2);
        break;
      case 'congelado':
        this.targetLookAt.set(28, 2, -2);
        this.setZoomLevel(2);
        break;
      case 'muelles':
        this.targetLookAt.set(0, 2, 22);
        this.setZoomLevel(2);
        break;
      case 'all':
      default:
        this.targetLookAt.set(0, 2, 5);
        this.setZoomLevel(3);
        break;
    }
  }

  public onResize(width: number, height: number): void {
    const aspect = width / height;
    const frustumSize = 40;
    this.camera.left = (-frustumSize * aspect) / 2;
    this.camera.right = (frustumSize * aspect) / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.updateProjectionMatrix();
  }

  public startPan(clientX: number, clientY: number): void {
    this.isDragging = true;
    this.previousMousePosition = { x: clientX, y: clientY };
  }

  public pan(clientX: number, clientY: number): void {
    if (!this.isDragging) return;

    const deltaX = clientX - this.previousMousePosition.x;
    const deltaY = clientY - this.previousMousePosition.y;

    this.previousMousePosition = { x: clientX, y: clientY };

    // Move lookAt along camera coordinate system
    const factor = 0.05 / (this.camera.zoom / 15);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, this.camera.up).normalize();

    this.targetLookAt.addScaledVector(right, -deltaX * factor);
    this.targetLookAt.addScaledVector(forward, deltaY * factor);

    // Clamp boundary so user doesn't get lost in the void
    this.targetLookAt.x = THREE.MathUtils.clamp(this.targetLookAt.x, -45, 45);
    this.targetLookAt.z = THREE.MathUtils.clamp(this.targetLookAt.z, -35, 45);
  }

  public endPan(): void {
    this.isDragging = false;
  }

  public update(): void {
    // Interpolate rotation angle smoothly
    this.currentRotationAngle = THREE.MathUtils.lerp(this.currentRotationAngle, this.targetRotationAngle, 0.12);

    // Interpolate zoom smoothly
    this.currentZoom = THREE.MathUtils.lerp(this.currentZoom, this.targetZoom, 0.15);
    this.camera.zoom = this.currentZoom;
    this.camera.updateProjectionMatrix();

    // Interpolate lookAt target
    this.currentLookAt.lerp(this.targetLookAt, 0.12);

    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    // Calculate isometric camera position based on rotation and pitch
    const x = this.currentLookAt.x + this.distance * Math.cos(this.pitchAngle) * Math.sin(this.currentRotationAngle);
    const y = this.currentLookAt.y + this.distance * Math.sin(this.pitchAngle);
    const z = this.currentLookAt.z + this.distance * Math.cos(this.pitchAngle) * Math.cos(this.currentRotationAngle);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.currentLookAt);
  }
}
