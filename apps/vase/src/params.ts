export type VaseProfile = 'smooth' | 'faceted' | 'wavy';

export interface VaseParams {
  [key: string]: string | number | boolean;
  topDiameter: number;
  bottomDiameter: number;
  height: number;
  wall: number;
  bottomThickness: number;
  profile: VaseProfile;
  sides: number;
  waveDepth: number;
  twist: number;
  drainageHole: boolean;
  drainageDiameter: number;
  color: string;
}

export const DEFAULTS: VaseParams = {
  topDiameter: 120,
  bottomDiameter: 95,
  height: 180,
  wall: 2.4,
  bottomThickness: 3,
  profile: 'smooth',
  sides: 8,
  waveDepth: 5,
  twist: 0,
  drainageHole: false,
  drainageDiameter: 8,
  color: '#1f6f78',
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function sanitize(p: VaseParams): VaseParams {
  const bottomDiameter = clamp(p.bottomDiameter, 50, 220);
  const topDiameter = clamp(p.topDiameter, 50, 240);
  const wall = clamp(p.wall, 1.2, 5);
  const bottomThickness = clamp(p.bottomThickness, 1.6, 10);
  const drainageDiameter = clamp(p.drainageDiameter, 3, Math.max(3, bottomDiameter - 2 * wall - 12));
  return {
    ...p,
    topDiameter,
    bottomDiameter,
    height: clamp(p.height, 60, 300),
    wall,
    bottomThickness,
    profile: p.profile === 'faceted' || p.profile === 'wavy' ? p.profile : 'smooth',
    sides: Math.round(clamp(p.sides, 3, 16)),
    waveDepth: clamp(p.waveDepth, 1, Math.min(14, bottomDiameter / 5)),
    twist: clamp(p.twist, -180, 180),
    drainageHole: Boolean(p.drainageHole),
    drainageDiameter,
  };
}
