// Anteprima 3D condivisa da tutti i generatori: three.js, asse Z verso l'alto (come
// negli slicer), piatto di stampa con griglia, luci morbide, colori per pezzo.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Part } from '@bdl/geometry';

export interface ViewerOptions {
  /** Lato del piatto in mm (default 256, Bambu X1/P1/A1). */
  plateSize?: number;
}

export interface Viewer {
  setParts(parts: readonly Part[], opts?: { refit?: boolean }): void;
  fit(): void;
  setView(view: 'iso' | 'top' | 'front'): void;
  /** PNG dell'anteprima corrente (per miniature / condivisione). */
  snapshot(): string;
  dispose(): void;
}

export function createViewer(host: HTMLElement, opts: ViewerOptions = {}): Viewer {
  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
  const plate = opts.plateSize ?? 256;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.classList.add('bdl-canvas');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(120, -160, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera;
  sc.left = sc.bottom = -150; sc.right = sc.top = 150; sc.near = 1; sc.far = 800;
  key.shadow.bias = -0.0005;
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.5));

  // Piatto: superficie + griglia 10 mm, colori presi dai token CSS del tema.
  const plateGroup = new THREE.Group();
  const plateMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(plate, plate), plateMat);
  plateMesh.receiveShadow = true;
  plateMesh.position.z = -0.05;
  const grid = new THREE.GridHelper(plate, plate / 10);
  grid.rotation.x = Math.PI / 2;
  plateGroup.add(plateMesh, grid);
  scene.add(plateGroup);

  const applyTheme = () => {
    const css = getComputedStyle(host);
    const read = (name: string, fb: string) => css.getPropertyValue(name).trim() || fb;
    plateMat.color.set(read('--bdl-plate', '#d9dadb'));
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.color.set(read('--bdl-grid', '#b8babd'));
    gm.transparent = true;
    gm.opacity = 0.6;
  };
  applyTheme();
  const themeObs = new MutationObserver(applyTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', applyTheme);

  const model = new THREE.Group();
  scene.add(model);
  let first = true;

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  const box = () => {
    const b = new THREE.Box3().setFromObject(model);
    if (b.isEmpty()) b.set(new THREE.Vector3(-40, -40, 0), new THREE.Vector3(40, 40, 10));
    return b;
  };

  const place = (dir: THREE.Vector3) => {
    const b = box();
    const c = b.getCenter(new THREE.Vector3());
    const r = b.getBoundingSphere(new THREE.Sphere()).radius;
    // Usa il lato più stretto del canvas, così il modello entra anche su schermi verticali.
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = (r / Math.sin(Math.min(vHalf, hHalf))) * 1.0;
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(dir.normalize(), dist);
    camera.near = dist / 100;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    controls.update();
  };

  const views = {
    iso: new THREE.Vector3(0.55, -1, 0.85),
    top: new THREE.Vector3(0, -0.0001, 1),
    front: new THREE.Vector3(0, -1, 0.12),
  };

  return {
    setParts(parts, o = {}) {
      for (const child of [...model.children]) {
        const m = child as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        model.remove(m);
      }
      for (const p of parts) {
        if (!p.mesh.indices.length) continue;
        const src = new THREE.BufferGeometry();
        src.setAttribute('position', new THREE.BufferAttribute(p.mesh.positions, 3));
        src.setIndex(new THREE.BufferAttribute(p.mesh.indices, 1));
        // Le mesh di manifold condividono i vertici anche sugli spigoli vivi: le normali
        // "creased" tengono netti gli spigoli (> 30°) e lisce le superfici curve.
        const g = toCreasedNormals(src, Math.PI / 6);
        src.dispose();
        const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.02 });
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name = p.id;
        model.add(mesh);
      }
      if (first || o.refit) { place(views.iso.clone()); first = false; }
    },
    fit() { place(camera.position.clone().sub(controls.target)); },
    setView(v) { place(views[v].clone()); },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObs.disconnect();
      mq.removeEventListener('change', applyTheme);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
