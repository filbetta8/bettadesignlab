import type { Vec2 } from '@bdl/geometry';
import { parseSvg, type SvgArtwork } from '../../coaster/src/svg.ts';

/** Le immagini e i testi vengono tracciati localmente come disegni a un colore. */
export async function importArtwork(file: File, threshold: number): Promise<SvgArtwork> {
  if (file.size > 10_000_000) throw new Error('File troppo grande: massimo 10 MB.');
  if (/\.svg$/i.test(file.name)) return parseSvg(await file.text(), file.name);
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Usa SVG, PNG, JPG o WebP.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const scale = 192 / Math.max(image.naturalWidth, image.naturalHeight);
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return traceRaster(ctx.getImageData(0, 0, canvas.width, canvas.height), file.name, threshold);
  } finally { URL.revokeObjectURL(url); }
}

export function textArtwork(text: string): SvgArtwork {
  const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 96;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 192, 96);
  ctx.fillStyle = '#000'; ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.slice(0, 12), 96, 48, 180);
  return traceRaster(ctx.getImageData(0, 0, 192, 96), text, 180);
}

/** Rettangoli per intervalli di pixel, uniti dal kernel: conserva anche i fori. */
export function traceRaster(image: Pick<ImageData, 'width' | 'height' | 'data'>, name: string, threshold: number): SvgArtwork {
  const { width: w, height: h, data } = image;
  const shapes: Vec2[][][] = [];
  let minX = w, minY = h, maxX = 0, maxY = 0;
  const visible = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return data[i + 3] >= 128 && (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) < threshold;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
    if (!visible(x, y)) { x++; continue; }
    const start = x; while (x < w && visible(x, y)) x++;
    shapes.push([[[start, -y], [x, -y], [x, -y - 1], [start, -y - 1]]]);
    minX = Math.min(minX, start); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1);
  }
  if (!shapes.length) throw new Error('Nessun disegno visibile: aumenta la soglia o usa uno sfondo trasparente.');
  if (shapes.length > 6000) throw new Error('Immagine troppo dettagliata: usa un disegno più semplice o un SVG.');
  const size = Math.max(maxX - minX, maxY - minY);
  for (const shape of shapes) for (const ring of shape) for (const v of ring) {
    v[0] = (v[0] - (minX + maxX) / 2) / size;
    v[1] = (v[1] + (minY + maxY) / 2) / size;
  }
  return { name, shapes, filledShapes: shapes };
}
