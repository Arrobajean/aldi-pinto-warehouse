import * as THREE from 'three';

// Logo oficial de ALDI Nord (Wikimedia Commons, PD-textlogo con marca).
// En el modelo va sin distorsión y sin reclamar propiedad: solo identificación de la demo.
const URL = '/branding/aldi-nord.png';

/** Material compartido de los decales de marca (el mapa se asigna al cargar). */
export const brandDecalMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

let loaded = false;

/** Crea un decal de marca (PlaneGeometry) con el material compartido. */
export function createBrandDecal(pw: number, ph: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), brandDecalMaterial);
  mesh.userData.brand = true;
  return mesh;
}

/** Carga la textura del logo una única vez (falla en silencio si no existe). */
export function loadBranding(): Promise<void> {
  if (loaded) return Promise.resolve();
  loaded = true;
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        brandDecalMaterial.map = tex;
        brandDecalMaterial.needsUpdate = true;
        resolve();
      },
      undefined,
      () => resolve(),
    );
  });
}