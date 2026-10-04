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
  const number = (key: keyof VaseParams) => typeof p[key] === 'number' && Number.isFinite(p[key]) ? p[key] as number : DEFAULTS[key] as number;
  const bottomDiameter = clamp(number('bottomDiameter'), 50, 220);
  const topDiameter = clamp(number('topDiameter'), 50, 240);
  const wall = clamp(number('wall'), 1.2, 5);
  const bottomThickness = clamp(number('bottomThickness'), 1.6, 10);
  const sides = Math.round(clamp(number('sides'), 3, 16));
  const waveDepth = clamp(number('waveDepth'), 1, Math.min(14, bottomDiameter / 5));
  const inset = wall / Math.min(1, topDiameter / bottomDiameter);
  const inradius = bottomDiameter / 2 * (p.profile === 'faceted' ? Math.cos(Math.PI / sides) : 1) - (p.profile === 'wavy' ? waveDepth : 0);
  const drainageDiameter = clamp(number('drainageDiameter'), 3, Math.max(3, 2 * (inradius - inset) - 2));
  return {
    ...p,
    topDiameter,
    bottomDiameter,
    height: clamp(number('height'), 60, 300),
    wall,
    bottomThickness,
    profile: p.profile === 'faceted' || p.profile === 'wavy' ? p.profile : 'smooth',
    sides,
    waveDepth,
    twist: clamp(number('twist'), -180, 180),
    drainageHole: p.drainageHole === true,
    color: typeof p.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : DEFAULTS.color,
    drainageDiameter,
  };
}
