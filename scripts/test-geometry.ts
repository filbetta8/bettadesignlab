// Test della geometria in Node: costruisce ogni combinazione di forma × motivo × tecnica
// e verifica che i pezzi siano solidi chiusi (manifold), non vuoti e nelle misure attese.
// Gira in CI e in locale con `pnpm test`.

import { loadManifold } from '@bdl/geometry';
import { buildCoaster } from '../apps/coaster/src/geometry.ts';
import { DEFAULTS, type CoasterParams } from '../apps/coaster/src/params.ts';
import { toSTL, to3MF } from '@bdl/export';

const M = await loadManifold();
let failures = 0;
let runs = 0;
const fail = (msg: string) => { failures++; console.error('✗', msg); };

const shapes = ['round', 'square', 'hex', 'oct'] as const;
const patterns = ['none', 'rings', 'hex', 'stripes', 'grid', 'waves', 'dots'] as const;
const modes = ['inlay', 'relief'] as const;

for (const shape of shapes) for (const pattern of patterns) for (const patternMode of modes) for (const corkRecess of [false, true]) {
  const p: CoasterParams = { ...DEFAULTS, shape, pattern, patternMode, corkRecess };
  const label = `${shape}/${pattern}/${patternMode}${corkRecess ? '/cork' : ''}`;
  runs++;
  const t0 = performance.now();
  const { parts } = buildCoaster(M, p);
  const ms = performance.now() - t0;
  if (!parts.length || !parts[0].mesh.indices.length) { fail(`${label}: base vuota`); continue; }
  if (pattern !== 'none' && parts.length !== 2) fail(`${label}: atteso 2 pezzi, trovati ${parts.length}`);
  for (const part of parts) {
    // Ricostruisce un Manifold dalla mesh: se non è chiusa/valida, status != NoError.
    const mesh = new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices });
    mesh.merge();
    const solid = new M.Manifold(mesh);
    if (solid.status() !== 'NoError') fail(`${label}/${part.id}: mesh non valida (${solid.status()})`);
    if (solid.volume() <= 0) fail(`${label}/${part.id}: volume nullo`);
    const bb = solid.boundingBox();
    if (part.id === 'base') {
      const w = bb.max[0] - bb.min[0];
      if (Math.abs(w - p.size) > p.size * 0.16) fail(`${label}: larghezza ${w.toFixed(1)} lontana da ${p.size}`);
      if (Math.abs(bb.min[2]) > 1e-3) fail(`${label}: la base non poggia sul piatto (z min ${bb.min[2]})`);
    }
    solid.delete();
  }
  if (ms > 1500) fail(`${label}: troppo lento (${ms.toFixed(0)} ms)`);
}

// Gli export producono file non vuoti e un 3MF che è uno zip.
const { parts } = buildCoaster(M, DEFAULTS);
const stl = toSTL(parts);
if (stl.length < 1000) fail('STL troppo piccolo');
const tmf = to3MF(parts);
if (tmf[0] !== 0x50 || tmf[1] !== 0x4b) fail('3MF non è uno zip');

console.log(`${runs} combinazioni provate, ${failures} errori`);
process.exit(failures ? 1 : 0);
