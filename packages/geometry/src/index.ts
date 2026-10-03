// Wrapper sottile su manifold-3d (WASM): caricamento una volta sola, gestione della
// memoria e conversione verso mesh semplici che viewer ed export capiscono.
//
// manifold-3d vive nella memoria WASM: ogni CrossSection/Manifold va liberato con
// delete(). `Scope` raccoglie tutto ciò che viene creato durante una build e lo libera
// alla fine, così i generatori non devono pensarci.

import Module from 'manifold-3d';
import type { ManifoldToplevel, CrossSection, Manifold } from 'manifold-3d';

export type { ManifoldToplevel, CrossSection, Manifold };
export type Vec2 = [number, number];

let ready: Promise<ManifoldToplevel> | null = null;

/** Carica il WASM una volta. In browser passare l'URL di `manifold-3d/manifold.wasm?url`. */
export function loadManifold(wasmUrl?: string): Promise<ManifoldToplevel> {
  if (!ready) {
    ready = Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((m) => {
      m.setup();
      return m;
    });
  }
  return ready;
}

/** Raccoglie oggetti WASM e li libera tutti insieme. */
export class Scope {
  private items: { delete(): void }[] = [];
  /** Registra un oggetto e lo restituisce, per l'uso in linea: `const a = s.t(b.offset(1))`. */
  t<T extends { delete(): void }>(obj: T): T {
    this.items.push(obj);
    return obj;
  }
  free(): void {
    for (const o of this.items) {
      try { o.delete(); } catch { /* già liberato */ }
    }
    this.items = [];
  }
}

/** Mesh indicizzata indipendente da WASM: posizioni xyz in mm, triangoli. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Un pezzo del modello: diventa un oggetto separato nel 3MF (un colore/filamento). */
export interface Part {
  id: string;
  name: string;
  color: string;
  mesh: MeshData;
}

export function toMeshData(m: Manifold): MeshData {
  const mesh = m.getMesh();
  const n = mesh.numVert;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = mesh.vertProperties[i * mesh.numProp];
    positions[i * 3 + 1] = mesh.vertProperties[i * mesh.numProp + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * mesh.numProp + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

export function isEmptyMesh(m: MeshData): boolean {
  return m.indices.length === 0;
}

export function bounds(parts: readonly Part[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const a = p.mesh.positions;
    for (let i = 0; i < a.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (a[i + k] < min[k]) min[k] = a[i + k];
        if (a[i + k] > max[k]) max[k] = a[i + k];
      }
    }
  }
  return { min, max };
}

// ---------- Profili 2D ricorrenti ----------

/** Poligono regolare con lati piatti in basso; `acrossFlats` = distanza tra lati opposti. */
export function regularPolygon(n: number, acrossFlats: number): Vec2[] {
  const r = acrossFlats / 2 / Math.cos(Math.PI / n);
  const start = -Math.PI / 2 + Math.PI / n;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i * 2 * Math.PI) / n;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/** Contorno di una forma base centrata nell'origine. */
export type OutlineShape = 'round' | 'square' | 'hex' | 'oct';

export function outline(
  M: ManifoldToplevel,
  s: Scope,
  shape: OutlineShape,
  size: number,
  cornerRadius = 0,
): CrossSection {
  const { CrossSection } = M;
  switch (shape) {
    case 'round':
      return s.t(CrossSection.circle(size / 2, 160));
    case 'square': {
      const r = Math.max(0, Math.min(cornerRadius, size / 2 - 0.5));
      if (r < 0.01) return s.t(CrossSection.square([size, size], true));
      const inner = s.t(CrossSection.square([size - 2 * r, size - 2 * r], true));
      return s.t(inner.offset(r, 'Round', 2, 64));
    }
    case 'hex':
      return s.t(CrossSection.ofPolygons([regularPolygon(6, size)]));
    case 'oct':
      return s.t(CrossSection.ofPolygons([regularPolygon(8, size)]));
  }
}
