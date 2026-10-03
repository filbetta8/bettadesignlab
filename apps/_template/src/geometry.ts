// Geometria di esempio: una vaschetta con angoli arrotondati. Sostituire con quella del
// nuovo generatore, mantenendo la firma: (manifold, parametri) → { parts, warnings }.

import { Scope, toMeshData, type ManifoldToplevel, type Part } from '@bdl/geometry';
import type { Params } from './params.ts';

export function build(M: ManifoldToplevel, p: Params): { parts: Part[]; warnings: string[] } {
  const s = new Scope();
  try {
    const { CrossSection } = M;
    const r = Math.min(p.radius, p.width / 2 - 0.5, p.depth / 2 - 0.5);
    const core = s.t(CrossSection.square([p.width - 2 * r, p.depth - 2 * r], true));
    const outer = r > 0 ? s.t(core.offset(r, 'Round', 2, 64)) : core;
    const inner = s.t(outer.offset(-p.wall, 'Round', 2, 64));
    const shell = s.t(outer.extrude(p.height));
    const cavity = s.t(s.t(inner.extrude(p.height)).translate([0, 0, p.wall]));
    const solid = s.t(shell.subtract(cavity));
    return { parts: [{ id: 'body', name: 'Corpo', color: p.color, mesh: toMeshData(solid) }], warnings: [] };
  } finally {
    s.free();
  }
}
