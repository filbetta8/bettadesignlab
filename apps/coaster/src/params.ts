import type { OutlineShape } from '@bdl/geometry';

export type Pattern = 'none' | 'rings' | 'hex' | 'stripes' | 'grid' | 'waves' | 'dots';
export type PatternMode = 'relief' | 'inlay';

export interface CoasterParams {
  [key: string]: string | number | boolean;
  shape: OutlineShape;
  size: number;
  cornerRadius: number;
  baseHeight: number;
  rimWidth: number;
  rimHeight: number;
  pattern: Pattern;
  patternMode: PatternMode;
  patternHeight: number;
  spacing: number;
  lineWidth: number;
  angle: number;
  corkRecess: boolean;
  corkDepth: number;
  baseColor: string;
  patternColor: string;
}

export const DEFAULTS: CoasterParams = {
  shape: 'round',
  size: 100,
  cornerRadius: 10,
  baseHeight: 3.2,
  rimWidth: 3,
  rimHeight: 1.2,
  pattern: 'hex',
  patternMode: 'inlay',
  patternHeight: 0.8,
  spacing: 9,
  lineWidth: 1.6,
  angle: 0,
  corkRecess: false,
  corkDepth: 1,
  baseColor: '#25355e',
  patternColor: '#d4a429',
};

const SHAPES: OutlineShape[] = ['round', 'square', 'hex', 'oct'];
const PATTERNS: Pattern[] = ['none', 'rings', 'hex', 'stripes', 'grid', 'waves', 'dots'];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Riporta in range i valori arrivati da un link condiviso (o modificati a mano). */
export function sanitize(p: CoasterParams): CoasterParams {
  return {
    ...p,
    shape: SHAPES.includes(p.shape) ? p.shape : DEFAULTS.shape,
    pattern: PATTERNS.includes(p.pattern) ? p.pattern : DEFAULTS.pattern,
    patternMode: p.patternMode === 'relief' ? 'relief' : 'inlay',
    size: clamp(p.size, 60, 140),
    cornerRadius: clamp(p.cornerRadius, 0, 40),
    baseHeight: clamp(p.baseHeight, 1.6, 8),
    rimWidth: clamp(p.rimWidth, 0, 10),
    rimHeight: clamp(p.rimHeight, 0, 5),
    patternHeight: clamp(p.patternHeight, 0.2, 3),
    spacing: clamp(p.spacing, 4, 25),
    lineWidth: clamp(p.lineWidth, 0.8, 5),
    angle: clamp(p.angle, 0, 180),
    corkDepth: clamp(p.corkDepth, 0.5, 3),
  };
}
