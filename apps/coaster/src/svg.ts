import { SVGLoader, type StrokeStyle } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Vec2 } from '@bdl/geometry';

/** Contorni normalizzati: lato maggiore = 1, centro nell'origine, Y verso l'alto. */
export interface SvgArtwork { name: string; shapes: Vec2[][][]; filledShapes?: Vec2[][][]; }

export function parseSvg(text: string, name: string): SvgArtwork {
  if (text.length > 500_000) throw new Error('SVG troppo grande: massimo 500 KB.');
  text = stripSvgDoctype(text);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('File SVG non valido.');
  // Il file resta locale e non viene inserito nel DOM. Escludiamo elementi che
  // richiedono risorse esterne o che non descrivono geometria vettoriale autonoma.
  if (doc.querySelector('script, foreignObject, image, use, text, style, filter, mask, clipPath')) {
    throw new Error('Converti i testi in tracciati e usa un SVG senza immagini, CSS o maschere.');
  }
  for (const node of doc.querySelectorAll('*')) {
    for (const attr of node.attributes) {
      if (/^on/i.test(attr.name) || /href$/i.test(attr.name) || /url\s*\(/i.test(attr.value)) throw new Error('SVG con riferimenti esterni non supportato.');
    }
  }
  const result = new SVGLoader().parse(text);
  const shapes: Vec2[][][] = [];
  const filledShapes: Vec2[][][] = [];
  let count = 0;
  const add = (contours: Vec2[][], filled: boolean) => {
    count += contours.reduce((n, ring) => n + ring.length, 0);
    if (count > 20_000) throw new Error('SVG troppo complesso: semplifica i tracciati.');
    if (contours.some((ring) => ring.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))) throw new Error('Coordinate SVG non valide.');
    if (contours[0].length >= 3) {
      shapes.push(contours);
      if (filled) filledShapes.push(contours.map((ring) => ring.map(([x, y]): Vec2 => [x, y])));
    }
  };
  for (const path of result.paths) {
    const style = path.userData?.style as Record<string, string | number> | undefined;
    if (Number(style?.opacity ?? 1) === 0) continue;
    if (style?.fill !== 'none' && Number(style?.fillOpacity ?? 1) > 0) {
      for (const shape of SVGLoader.createShapes(path)) {
        const points = shape.extractPoints(12);
        add([points.shape, ...points.holes].map((ring) => ring.map((v): Vec2 => [v.x, -v.y])), true);
      }
    }
    if (style?.stroke && style.stroke !== 'none' && Number(style.strokeOpacity ?? 1) > 0 && Number(style.strokeWidth ?? 1) > 0) {
      for (const subPath of path.subPaths) {
        const points = subPath.getPoints(12);
        if (subPath.autoClose && points.length && !points[0].equals(points[points.length - 1])) points.push(points[0].clone());
        const geometry = SVGLoader.pointsToStroke(points, style as unknown as StrokeStyle, 12);
        if (!geometry) continue;
        try {
          const positions = geometry.getAttribute('position');
          const index = geometry.getIndex();
          const length = index?.count ?? positions.count;
          for (let i = 0; i < length; i += 3) {
            const triangle: Vec2[] = [];
            for (let k = 0; k < 3; k++) {
              const v = index ? index.getX(i + k) : i + k;
              triangle.push([positions.getX(v), -positions.getY(v)]);
            }
            add([triangle], false);
          }
        } finally { geometry.dispose(); }
      }
    }
  }
  if (!shapes.length) throw new Error('Nessuna area o linea visibile trovata nell’SVG.');
  normalize(shapes);
  if (filledShapes.length) normalize(filledShapes);
  return { name, shapes, filledShapes };
}

function normalize(shapes: Vec2[][][]): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const shape of shapes) for (const ring of shape) for (const [x, y] of ring) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  if (size < 1e-6) throw new Error('SVG senza area utile.');
  for (const shape of shapes) for (const ring of shape) for (const v of ring) {
    v[0] = (v[0] - (minX + maxX) / 2) / size;
    v[1] = (v[1] - (minY + maxY) / 2) / size;
  }
}

/** Elimina dichiarazioni esterne obsolete prima del parsing, senza caricare DTD. */
export function stripSvgDoctype(text: string): string {
  if (/<!ENTITY/i.test(text)) throw new Error('SVG con entità XML non supportato.');
  return text.replace(/<!DOCTYPE[^>]*>/gi, (declaration) => {
    if (declaration.includes('[') || !/^<!DOCTYPE\s+svg(?:\s|>)/i.test(declaration)) throw new Error('Dichiarazione XML SVG non supportata.');
    return '';
  });
}
