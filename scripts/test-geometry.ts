// Test della geometria in Node: costruisce ogni combinazione di forma × motivo × tecnica
// e verifica che i pezzi siano solidi chiusi (manifold), non vuoti e nelle misure attese.
// Gira in CI e in locale con `pnpm test`.

import { loadManifold } from '@bdl/geometry';
import { buildCoaster } from '../apps/coaster/src/geometry.ts';
import { DEFAULTS, type CoasterParams } from '../apps/coaster/src/params.ts';
import { buildVase } from '../apps/vase/src/geometry.ts';
import { DEFAULTS as VASE_DEFAULTS, sanitize } from '../apps/vase/src/params.ts';
import { unzipSync, strFromU8 } from 'fflate';
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

// Vasi: tutti i profili, torsione nei due sensi, conicità e drenaggio.
for (const profile of ['smooth', 'faceted', 'wavy'] as const)
for (const twist of [-180, 0, 180])
for (const [bottomDiameter, topDiameter] of [[95, 120], [220, 50], [50, 240]])
for (const drainageHole of [false, true]) {
  const p = sanitize({ ...VASE_DEFAULTS, profile, twist, bottomDiameter, topDiameter,
    sides: 3, waveDepth: 14, wall: 5, bottomThickness: 10, height: 60,
    drainageHole, drainageDiameter: 220 });
  const label = `vase/${profile}/${twist}/${bottomDiameter}-${topDiameter}/${drainageHole}`;
  runs++;
  const { parts } = buildVase(M, p);
  const mesh = new M.Mesh({ numProp: 3, vertProperties: parts[0].mesh.positions, triVerts: parts[0].mesh.indices });
  mesh.merge();
  const solid = new M.Manifold(mesh);
  try {
    if (solid.status() !== 'NoError' || solid.volume() <= 0) fail(`${label}: solido non valido`);
    if (profile === 'smooth' && twist === 0 && !drainageHole) {
      // Volume analitico del tronco di cono: rileva anche cavità disallineate
      // che rimangono manifold e aperte al centro.
      const r = p.bottomDiameter / 2;
      const scale = p.topDiameter / p.bottomDiameter;
      const slope = (scale - 1) / p.height;
      const integral = (z: number) => z + slope * z * z + slope * slope * z * z * z / 3;
      const areaFactor = 128 / 2 * Math.sin(2 * Math.PI / 128);
      const innerRadius = r - p.wall / Math.min(1, scale) / Math.cos(Math.PI / 128);
      const expected = areaFactor * (r * r * integral(p.height) - innerRadius * innerRadius * (integral(p.height) - integral(p.bottomThickness)));
      if (Math.abs(solid.volume() - expected) > expected * 0.0001) fail(`${label}: cavità non allineata al guscio`);
    }
    const bb = solid.boundingBox();
    if (Math.abs(bb.min[2]) > 1e-3 || Math.abs(bb.max[2] - p.height) > 1e-3) fail(`${label}: altezza/fondo errati`);
    // Il centro deve essere vuoto sopra il fondo e pieno sotto, salvo drenaggio.
    const probe = M.Manifold.cylinder(p.height - p.bottomThickness - 2, 0.5, -1, 12);
    const above = probe.translate([0, 0, p.bottomThickness + 1]);
    const overlap = solid.intersect(above);
    if (overlap.volume() > 1e-5) fail(`${label}: bocca/cavità chiusa`);
    overlap.delete(); above.delete(); probe.delete();
    const baseProbe = M.Manifold.cylinder(p.bottomThickness - 0.2, 0.5, -1, 12);
    const base = baseProbe.translate([0, 0, 0.1]);
    const baseOverlap = solid.intersect(base);
    if (drainageHole ? baseOverlap.volume() > 1e-5 : Math.abs(baseOverlap.volume() - base.volume()) > 1e-5) fail(`${label}: fondo/drenaggio errato`);
    baseOverlap.delete(); base.delete(); baseProbe.delete();
    const stl = toSTL(parts);
    const triangles = parts[0].mesh.indices.length / 3;
    if (stl.length !== 84 + triangles * 50 || new DataView(stl.buffer).getUint32(80, true) !== triangles) fail(`${label}: STL errato`);
    const archive = unzipSync(to3MF(parts));
    const model = strFromU8(archive['3D/3dmodel.model']);
    if (!model.includes('unit="millimeter"') || model.includes('NaN') || model.includes('Infinity') || (model.match(/<triangle /g) ?? []).length !== triangles) fail(`${label}: 3MF errato`);
  } finally { solid.delete(); }
}
const invalid = sanitize({ ...VASE_DEFAULTS, height: NaN, wall: Infinity, color: '"/><invalid>', drainageHole: 'false' as unknown as boolean });
if (invalid.height !== VASE_DEFAULTS.height || invalid.wall !== VASE_DEFAULTS.wall || invalid.color !== VASE_DEFAULTS.color || invalid.drainageHole) fail('vase: parametri non validi accettati');

console.log(`${runs} combinazioni provate, ${failures} errori`);
process.exit(failures ? 1 : 0);
