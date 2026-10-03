import { Scope, toMeshData, type ManifoldToplevel, type Part, type Vec2 } from '@bdl/geometry';
import type { VaseParams } from './params.ts';

export function buildVase(M: ManifoldToplevel, p: VaseParams): { parts: Part[]; warnings: string[] } {
  const s = new Scope();
  const warnings: string[] = [];
  try {
    const { CrossSection, Manifold } = M;
    const outerProfile = s.t(CrossSection.ofPolygons([profilePoints(p)]));
    const scaleTop = p.topDiameter / p.bottomDiameter;
    const divisions = Math.max(8, Math.ceil(Math.abs(p.twist) / 12));
    // `extrude` richiede una scala XY: uno scalare trasformerebbe Y in zero,
    // schiacciando la bocca del vaso in una linea.
    const topScale: [number, number] = [scaleTop, scaleTop];
    let body = s.t(outerProfile.extrude(p.height, divisions, p.twist, topScale));

    // La cavità supera leggermente il bordo superiore: il vaso resta aperto e con fondo pieno.
    const innerProfile = s.t(outerProfile.offset(-p.wall, 'Round', 2, 64));
    const inner = s.t(
      innerProfile.extrude(p.height - p.bottomThickness + 0.02, divisions, p.twist, topScale)
        .translate([0, 0, p.bottomThickness]),
    );
    body = s.t(body.subtract(inner));

    if (p.drainageHole) {
      const hole = s.t(Manifold.cylinder(p.bottomThickness + 0.04, p.drainageDiameter / 2, -1, 48)
        .translate([0, 0, -0.02]));
      body = s.t(body.subtract(hole));
      warnings.push('Foro di drenaggio attivo: il modello non trattiene acqua.');
    }

    return {
      parts: [{ id: 'vase', name: 'Vaso', color: p.color, mesh: toMeshData(body) }],
      warnings,
    };
  } finally {
    s.free();
  }
}

function profilePoints(p: VaseParams): Vec2[] {
  const radius = p.bottomDiameter / 2;
  const count = p.profile === 'smooth' ? 128 : p.profile === 'faceted' ? p.sides : p.sides * 8;
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * Math.PI * 2) / count;
    const modulation = p.profile === 'wavy' ? p.waveDepth * Math.cos(p.sides * angle) : 0;
    points.push([(radius + modulation) * Math.cos(angle), (radius + modulation) * Math.sin(angle)]);
  }
  return points;
}
