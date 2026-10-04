import { FILAMENTS } from '@bdl/brand';
import { DEFAULT_BLOCKS, readBlocks } from './blocks.ts';

export interface Params {
  [key: string]: string | number | boolean;
  product: 'clicker' | 'keycap';
  shape: 'square' | 'round' | 'hex' | 'artwork' | 'blocks';
  blockData: string; switchX: number; switchY: number; loopAngle: number; loopHole: number;
  size: number; topThickness: number; decorationDepth: number; designScale: number;
  mode: 'inlay' | 'relief' | 'engrave';
  gap: number; stemFit: number; socketFit: number; rim: number;
  switches: number; spacing: number; keychain: boolean;
  compact: boolean;
  baseColor: string; capColor: string; artColor: string;
}
export const DEFAULTS: Params = {
  product: 'clicker', shape: 'square', size: 35, topThickness: 1.6,
  decorationDepth: 0.8, designScale: 75, mode: 'inlay', gap: 0.35,
  stemFit: 0.1, socketFit: 0.15, rim: 2.4, switches: 1, spacing: 20,
  keychain: false, compact: true, baseColor: '#25355e', capColor: '#f2f0eb', artColor: '#d4a429',
  blockData: JSON.stringify(DEFAULT_BLOCKS), switchX: 0, switchY: 0, loopAngle: 0, loopHole: 4,
};
export function sanitize(input: Params): Params {
  const p = { ...DEFAULTS };
  for (const key of ['product', 'shape', 'mode'] as const) {
    const choices = key === 'product' ? ['clicker', 'keycap'] : key === 'shape' ? ['square', 'round', 'hex', 'artwork', 'blocks'] : ['inlay', 'relief', 'engrave'];
    if (choices.includes(String(input[key]))) (p[key] as string) = input[key];
  }
  const limits: Record<string, [number, number]> = {
    size: [18, 100], topThickness: [1.2, 4], decorationDepth: [0.2, 2],
    designScale: [10, 100], gap: [0.15, 0.8], stemFit: [-0.1, 0.35],
    socketFit: [0, 0.5], rim: [0, 3], switches: [1, 3], spacing: [19, 30],
    switchX: [-60, 60], switchY: [-60, 60], loopAngle: [-180, 180], loopHole: [3, 8],
  };
  for (const [key, [lo, hi]] of Object.entries(limits)) {
    const v = Number(input[key]); p[key] = Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : DEFAULTS[key];
  }
  p.switches = p.product === 'keycap' ? 1 : Math.round(p.switches);
  if (p.product === 'clicker') p.size = Math.max(p.size, 20 + (p.switches - 1) * p.spacing);
  p.decorationDepth = Math.min(p.decorationDepth, p.topThickness - 0.6);
  p.keychain = input.keychain === true;
  p.blockData = JSON.stringify(readBlocks(typeof input.blockData === 'string' && input.blockData.length < 10000 ? input.blockData : DEFAULTS.blockData));
  p.compact = input.compact === undefined ? DEFAULTS.compact : input.compact === true;
  for (const key of ['baseColor', 'capColor', 'artColor'] as const) {
    if (FILAMENTS.some((f) => f.hex === input[key])) p[key] = input[key];
  }
  return p;
}
