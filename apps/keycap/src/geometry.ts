import { Scope, outline, toMeshData, type Part, type ManifoldToplevel, type CrossSection, type Manifold } from '@bdl/geometry';
import type { SvgArtwork } from '../../coaster/src/svg.ts';
import { sanitize, type Params } from './params.ts';

/** Montaggio MX standard: piano di appoggio 10.3 mm, piastra 1.5 mm.
 * Il fondo lascia spazio al corpo inferiore e ai pin, senza PCB o cablaggio. */
export function buildKeycap(M: ManifoldToplevel, input: Params, artwork?: SvgArtwork): { parts: Part[]; warnings: string[] } {
  const p = sanitize(input), s = new Scope();
  const parts: Part[] = [], warnings: string[] = [];
  const plateZ = 10.3, capZ = plateZ + 7;
  const positions = Array.from({ length: p.switches }, (_, i) => (i - (p.switches - 1) / 2) * p.spacing);
  try {
    const { CrossSection: C } = M;
    const solid = (cs: CrossSection, h: number, z = 0) => s.t(s.t(cs.extrude(h)).translate([0, 0, z]));
    const square = (x: number, y: number) => s.t(C.square([x, y], true));
    const addPart = (id: string, name: string, color: string, m: Manifold) => {
      if (m.isEmpty()) return;
      if (m.status() !== 'NoError') throw new Error('Geometria non valida: modifica la sagoma.');
      parts.push({ id, name, color, mesh: toMeshData(m) });
    };
    let drawing: CrossSection | undefined;
    if (artwork) {
      const regions = artwork.shapes.map((rings) => s.t(C.ofPolygons(rings, 'EvenOdd')));
      drawing = s.t(C.union(regions));
    }
    let capOutline: CrossSection;
    if (p.shape === 'artwork') {
      if (!artwork || !drawing) throw new Error('Carica un disegno prima di usare la sagoma personalizzata.');
      const filled = artwork.filledShapes ?? artwork.shapes;
      if (!filled.length) throw new Error('La sagoma richiede aree piene.');
      const cs = s.t(C.union(filled.map((rings) => s.t(C.ofPolygons(rings, 'EvenOdd')))));
      const scaled = s.t(cs.scale(p.size));
      // Il nucleo continuo sostiene tutti gli switch anche su immagini strette.
      capOutline = s.t(s.t(scaled.offset(1, 'Round', 2, 48)).add(outline(M, s, 'square', 20 + (p.switches - 1) * p.spacing, 3)));
      const components = capOutline.decompose(); components.forEach((c) => s.t(c));
      if (components.length !== 1) throw new Error('La sagoma ha isole separate: usa una forma standard oppure collega gli elementi.');
      warnings.push('La sagoma include un nucleo di sostegno per gli switch.');
    } else capOutline = outline(M, s, p.shape, p.size, 3);
    const outside = s.t(capOutline.offset(2 + p.gap, 'Round', 2, 64));
    if (p.product === 'clicker') {
      let base = solid(outside, plateZ + 1.5 + p.rim);
      // Il pulsante si muove entro il bordo: la cavità superiore resta libera.
      base = s.t(base.subtract(solid(s.t(capOutline.offset(p.gap, 'Round', 2, 64)), 12, plateZ + 1.5)));
      for (const x of positions) {
        const lower = s.t(square(16 + p.socketFit, 16 + p.socketFit).translate([x, 0]));
        const throat = s.t(square(14 + p.socketFit, 14 + p.socketFit).translate([x, 0]));
        base = s.t(base.subtract(solid(lower, plateZ - 1.8, 1.8)));
        base = s.t(base.subtract(solid(throat, 15, plateZ)));
      }
      if (p.keychain) {
        const box = outside.bounds();
        const x = box.max[0] + 3;
        const loop = s.t(s.t(C.circle(5, 48)).translate([x, 0]));
        const hole = s.t(s.t(C.circle(2, 48)).translate([x, 0]));
        base = s.t(base.add(solid(loop, 3)));
        base = s.t(base.subtract(solid(hole, 4)));
      }
      addPart('base', 'Base', p.baseColor, base);
    }
    let cap = solid(capOutline, p.topThickness, capZ);
    for (const x of positions) {
      const collar = s.t(s.t(C.circle(2.8, 48)).translate([x, 0]));
      cap = s.t(cap.add(solid(collar, 4.2, capZ - 4)));
      const cross = s.t(square(4.1 + p.stemFit, 1.17 + p.stemFit).add(square(1.17 + p.stemFit, 4.1 + p.stemFit)));
      const at = s.t(cross.translate([x, 0]));
      cap = s.t(cap.subtract(solid(at, 3.7, capZ - 4)));
    }
    if (drawing) {
      const design = s.t(drawing.scale(p.size * p.designScale / 100));
      const clipped = s.t(design.intersect(s.t(capOutline.offset(-0.3, 'Round', 2, 48))));
      if (clipped.isEmpty()) warnings.push('Il disegno non interseca il pulsante.');
      else {
        const z = p.mode === 'relief' ? capZ + p.topThickness : capZ + p.topThickness - p.decorationDepth;
        const ink = solid(clipped, p.decorationDepth, z);
        if (p.mode !== 'relief') cap = s.t(cap.subtract(ink));
        if (p.mode !== 'engrave') {
          const pieces = ink.decompose(); pieces.forEach((m) => s.t(m));
          pieces.sort((a, b) => a.boundingBox().min[0] - b.boundingBox().min[0]);
          pieces.forEach((m, i) => addPart(`art-${i + 1}`, `Disegno ${i + 1}`, p.artColor, m));
        }
      }
    }
    addPart('cap', 'Pulsante / keycap', p.capColor, cap);
    // Un keycap singolo resta alla sua altezza d'assemblaggio; le viste/export
    // separati lo appoggiano sul piano senza modificare il modello originale.
    return { parts, warnings };
  } finally { s.free(); }
}

/** Cinque socket isolati: l'ordine va dal più stretto al più largo. */
export function buildFitTest(M: ManifoldToplevel, fit: number, color: string): Part[] {
  const s = new Scope();
  try {
    return [-0.1, 0, 0.1, 0.2, 0.3].map((delta, i) => {
      const value = Math.max(-0.1, Math.min(0.35, fit + delta));
      const a = s.t(M.CrossSection.square([4.1 + value, 1.17 + value], true));
      const b = s.t(M.CrossSection.square([1.17 + value, 4.1 + value], true));
      const cross = s.t(a.add(b));
      const block = s.t(s.t(M.CrossSection.square([8, 8], true)).extrude(5));
      const hole = s.t(cross.extrude(3.7));
      const tile = s.t(s.t(block.subtract(hole)).translate([i * 12, 0, 0]));
      return { id: `fit-${i}`, name: `Gioco ${value.toFixed(2)} mm`, color, mesh: toMeshData(tile) };
    });
  } finally { s.free(); }
}
