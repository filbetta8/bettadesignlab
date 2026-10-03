export interface Params {
  [key: string]: string | number | boolean;
  width: number;
  depth: number;
  height: number;
  wall: number;
  radius: number;
  color: string;
}

export const DEFAULTS: Params = { width: 80, depth: 60, height: 30, wall: 2, radius: 6, color: '#1f6f78' };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export function sanitize(p: Params): Params {
  return {
    ...p,
    width: clamp(p.width, 20, 250),
    depth: clamp(p.depth, 20, 250),
    height: clamp(p.height, 5, 200),
    wall: clamp(p.wall, 0.8, 6),
    radius: clamp(p.radius, 0, 30),
  };
}
