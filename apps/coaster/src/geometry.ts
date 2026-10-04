// Geometria del sottobicchiere. Funzione pura: parametri → pezzi (base + motivo).
// Non tocca il DOM, così la stessa funzione gira nel browser e nei test Node.

import { Scope, outline, toMeshData, type ManifoldToplevel, type CrossSection, type Part, type Vec2 } from '@bdl/geometry';
import { sanitize, type CoasterParams } from './params.ts';
import type { SvgArtwork } from './svg.ts';

export interface BuildResult {
  parts: Part[];
  warnings: string[];
}

/** Spessore minimo di materiale sotto qualsiasi incavo, in mm. */
const MIN_FLOOR = 0.6;

export function buildCoaster(M: ManifoldToplevel, p: CoasterParams, artwork?: SvgArtwork): BuildResult {
  p = sanitize(p);
  const s = new Scope();
  const warnings: string[] = [];
  try {
    const { Manifold } = M;
    if (p.svgUse !== 'none' && !artwork) throw new Error('Carica un SVG per usare questa modalità.');
    const svg = artwork && p.svgUse !== 'none' ? svgSection(M, s, artwork, p.svgUse === 'shape') : null;
    const shape = p.svgUse === 'shape' && svg
      ? s.t(svg.scale([p.size, p.size]))
      : outline(M, s, p.shape, p.size, p.cornerRadius);
    if (p.svgUse === 'shape') {
      const islands = shape.decompose().map((part) => s.t(part));
      if (islands.length !== 1) throw new Error('La sagoma SVG deve essere una sola forma connessa. Unisci le parti oppure usala come decorazione.');
    }

    // Base + bordo rialzato.
    let base = s.t(shape.extrude(p.baseHeight));
    if (p.rimWidth > 0 && p.rimHeight > 0) {
      const inner = s.t(shape.offset(-p.rimWidth, 'Round', 2, 64));
      const ring = s.t(shape.subtract(inner));
      const rim = s.t(s.t(ring.extrude(p.rimHeight + 0.01)).translate([0, 0, p.baseHeight - 0.01]));
      base = s.t(Manifold.union(base, rim));
    }

    // Area utile per il motivo: dentro il bordo, con un piccolo margine.
    const margin = p.rimWidth > 0 ? p.rimWidth + 1 : 3;
    const field = s.t(shape.offset(-margin, 'Round', 2, 64));

    // Incavo sotto per sughero/feltro.
    let corkDepth = 0;
    if (p.corkRecess) {
      corkDepth = Math.min(p.corkDepth, p.baseHeight - MIN_FLOOR);
      if (corkDepth < p.corkDepth) warnings.push('Incavo sughero ridotto: la base è troppo sottile.');
      const pocket2d = s.t(shape.offset(-(margin + 1), 'Round', 2, 64));
      const pocket = s.t(s.t(pocket2d.extrude(corkDepth + 0.01)).translate([0, 0, -0.01]));
      base = s.t(base.subtract(pocket));
    }

    const parts: Part[] = [];
    let patternPart: Part | null = null;

    if (p.pattern !== 'none' || p.svgUse === 'decoration') {
      const drawing = p.svgUse === 'decoration' && svg
        ? s.t(s.t(svg.scale([p.size * p.svgScale / 100, p.size * p.svgScale / 100])).rotate(p.angle))
        : patternSection(M, s, p, field);
      const pat2d = s.t(drawing.intersect(field));
      if (p.svgUse === 'decoration' && svg) {
        if (pat2d.isEmpty()) throw new Error('SVG fuori dall’area utile: riduci la dimensione.');
        if (drawing.area() - pat2d.area() > 0.01) warnings.push('SVG ritagliato entro il bordo: riduci la dimensione per conservarlo intero.');
      }
      if (!pat2d.isEmpty()) {
        if (p.patternMode === 'relief') {
          const solid = s.t(s.t(pat2d.extrude(p.patternHeight + 0.01)).translate([0, 0, p.baseHeight - 0.01]));
          patternPart = { id: 'pattern', name: 'Motivo', color: p.patternColor, mesh: toMeshData(solid) };
        } else {
          // Intarsio: il motivo è incassato a filo nella base. Profondità limitata per
          // lasciare sempre un fondo stampabile sopra l'eventuale incavo del sughero.
          const maxDepth = p.baseHeight - corkDepth - MIN_FLOOR;
          const depth = Math.min(p.patternHeight, maxDepth);
          if (depth < p.patternHeight) warnings.push(`Intarsio ridotto a ${depth.toFixed(1)} mm per lasciare un fondo solido.`);
          if (depth > 0.15) {
            const cutter = s.t(s.t(pat2d.extrude(depth + 0.02)).translate([0, 0, p.baseHeight - depth]));
            base = s.t(base.subtract(cutter));
            if (p.patternMode === 'inlay') {
              const fill = s.t(s.t(pat2d.extrude(depth)).translate([0, 0, p.baseHeight - depth]));
              patternPart = { id: 'pattern', name: 'Motivo', color: p.patternColor, mesh: toMeshData(fill) };
            }
          } else {
            warnings.push('Base troppo sottile per l’intarsio: aumenta lo spessore.');
          }
        }
      }
    }

    parts.push({ id: 'base', name: 'Base', color: p.baseColor, mesh: toMeshData(base) });
    if (patternPart) parts.push(patternPart);
    return { parts, warnings };
  } finally {
    s.free();
  }
}

/** Disegno 2D del motivo, in un quadrato che copre tutta l'area utile. */
function patternSection(M: ManifoldToplevel, s: Scope, p: CoasterParams, field: CrossSection): CrossSection {
  const { CrossSection } = M;
  const R = p.size / 2 + 2;
  const w = p.lineWidth;
  const gap = p.spacing;

  switch (p.pattern) {
    case 'rings': {
      // Anelli che seguono la forma (tondi in un tondo, esagonali in un esagono…).
      const rings: CrossSection[] = [];
      for (let d = gap * 0.5; d < R; d += gap) {
        const outer = s.t(field.offset(-d, 'Round', 2, 64));
        if (outer.isEmpty()) break;
        const inner = s.t(field.offset(-d - w, 'Round', 2, 64));
        rings.push(s.t(outer.subtract(inner)));
      }
      return s.t(CrossSection.union(rings));
    }
    case 'stripes': {
      const bars: CrossSection[] = [];
      for (let x = -R * 1.5; x <= R * 1.5; x += gap) {
        bars.push(s.t(s.t(CrossSection.square([w, R * 3], true)).translate([x, 0])));
      }
      return s.t(s.t(CrossSection.union(bars)).rotate(p.angle));
    }
    case 'grid': {
      const bars: CrossSection[] = [];
      for (let x = -R * 1.5; x <= R * 1.5; x += gap) {
        bars.push(s.t(s.t(CrossSection.square([w, R * 3], true)).translate([x, 0])));
        bars.push(s.t(s.t(CrossSection.square([R * 3, w], true)).translate([0, x])));
      }
      return s.t(s.t(CrossSection.union(bars)).rotate(p.angle));
    }
    case 'hex': {
      // Nido d'ape: celle esagonali vuote, pareti di spessore w.
      const cell = gap; // distanza tra centri
      // Buchi già ristretti di w/2 per lato: uniti non si toccano, le pareti restano.
      const hole = hexPoly(Math.max(0.1, cell - w) / Math.sqrt(3));
      const cells: CrossSection[] = [];
      const dy = cell * Math.sqrt(3) / 2;
      for (let row = -Math.ceil(R / dy) - 1; row <= Math.ceil(R / dy) + 1; row++) {
        for (let col = -Math.ceil(R / cell) - 1; col <= Math.ceil(R / cell) + 1; col++) {
          const x = col * cell + (row % 2 ? cell / 2 : 0);
          const y = row * dy;
          cells.push(s.t(s.t(CrossSection.ofPolygons([hole])).translate([x, y])));
        }
      }
      const holes = s.t(CrossSection.union(cells));
      const bigSquare = s.t(CrossSection.square([R * 3, R * 3], true));
      return s.t(s.t(bigSquare.subtract(holes)).rotate(p.angle));
    }
    case 'dots': {
      const dots: CrossSection[] = [];
      const dy = gap * Math.sqrt(3) / 2;
      const r = Math.max(0.4, Math.min(w * 1.2, gap * 0.45));
      for (let row = -Math.ceil(R / dy); row <= Math.ceil(R / dy); row++) {
        for (let col = -Math.ceil(R / gap) - 1; col <= Math.ceil(R / gap) + 1; col++) {
          const x = col * gap + (row % 2 ? gap / 2 : 0);
          dots.push(s.t(s.t(CrossSection.circle(r, 24)).translate([x, row * dy])));
        }
      }
      return s.t(s.t(CrossSection.union(dots)).rotate(p.angle));
    }
    case 'waves': {
      const bands: CrossSection[] = [];
      const amp = gap * 0.35;
      const k = (2 * Math.PI) / (gap * 2.2);
      for (let y0 = -R * 1.5; y0 <= R * 1.5; y0 += gap) {
        const top: Vec2[] = [];
        const bottom: Vec2[] = [];
        for (let x = -R * 1.5; x <= R * 1.5; x += 0.8) {
          const y = y0 + amp * Math.sin(k * x);
          top.push([x, y + w / 2]);
          bottom.push([x, y - w / 2]);
        }
        bands.push(s.t(CrossSection.ofPolygons([[...bottom, ...top.reverse()]])));
      }
      return s.t(s.t(CrossSection.union(bands)).rotate(p.angle));
    }
    default:
      return s.t(new CrossSection([]));
  }
}

function hexPoly(r: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function svgSection(M: ManifoldToplevel, s: Scope, artwork: SvgArtwork, filledOnly: boolean): CrossSection {
  const shapes = filledOnly ? artwork.filledShapes ?? artwork.shapes : artwork.shapes;
  if (!shapes.length) throw new Error('Per la sagoma serve un SVG con aree piene. Le linee possono essere usate come decorazione.');
  const regions = shapes.map((contours) => s.t(M.CrossSection.ofPolygons(contours, 'EvenOdd')));
  const section = s.t(M.CrossSection.union(regions));
  if (section.isEmpty() || section.area() < 1e-8) throw new Error('SVG senza geometria piena valida.');
  return section;
}
