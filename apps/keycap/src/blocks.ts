import { Scope, outline, type ManifoldToplevel, type CrossSection } from '@bdl/geometry';

export interface Block { shape: 'square' | 'round' | 'hex'; width: number; height: number; x: number; y: number; angle: number; }
export const DEFAULT_BLOCKS: Block[] = [{ shape: 'square', width: 32, height: 28, x: 0, y: 0, angle: 0 }];
const number = (v: unknown, fallback: number, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export function readBlocks(raw: string): Block[] {
  let input: unknown; try { input = JSON.parse(raw); } catch { input = DEFAULT_BLOCKS; }
  if (!Array.isArray(input) || !input.length || input.length > 12) input = DEFAULT_BLOCKS;
  return (input as unknown[]).map((value) => {
    const b = value && typeof value === 'object' ? value as Partial<Block> : {};
    return { shape: b.shape === 'round' || b.shape === 'hex' ? b.shape : 'square',
      width: number(b.width, 32, 8, 80), height: number(b.height, 28, 8, 80),
      x: number(b.x, 0, -60, 60), y: number(b.y, 0, -60, 60), angle: number(b.angle, 0, -180, 180) };
  });
}
export function blockOutline(M: ManifoldToplevel, s: Scope, blocks: Block[]): CrossSection {
  const regions = blocks.map((b) => {
    const profile = outline(M, s, b.shape, b.width, 2);
    return s.t(s.t(s.t(profile.scale([1, b.height / b.width])).rotate(b.angle)).translate([b.x, b.y]));
  });
  const combined = s.t(M.CrossSection.union(regions));
  const components = combined.decompose(); components.forEach((c) => s.t(c));
  if (components.length !== 1) throw new Error('I blocchi devono sovrapporsi per creare un unico portachiavi. Avvicina il blocco separato.');
  return combined;
}
