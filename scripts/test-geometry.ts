// Test della geometria in Node: costruisce ogni combinazione di forma × motivo × tecnica
// e verifica che i pezzi siano solidi chiusi (manifold), non vuoti e nelle misure attese.
// Gira in CI e in locale con `pnpm test`.

import { loadManifold } from '@bdl/geometry';
import { buildCoaster } from '../apps/coaster/src/geometry.ts';
import { DEFAULTS, sanitize as sanitizeCoaster, type CoasterParams } from '../apps/coaster/src/params.ts';
import { buildVase } from '../apps/vase/src/geometry.ts';
import { DEFAULTS as VASE_DEFAULTS, sanitize } from '../apps/vase/src/params.ts';
import { groundPart, separateParts } from '../apps/coaster/src/parts.ts';
import { bounds } from '@bdl/geometry';
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

// Import SVG: fori preservati, intarsio/incisione con sughero e sagome connesse.
const artwork = { name: 'anello.svg', shapes: [[
  [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
  [[-0.15, -0.15], [0.15, -0.15], [0.15, 0.15], [-0.15, 0.15]],
]] } as import('../apps/coaster/src/svg.ts').SvgArtwork;
for (const svgUse of ['decoration', 'shape'] as const)
for (const patternMode of ['relief', 'inlay', 'engrave'] as const)
for (const corkRecess of [false, true]) {
  runs++;
  const p = sanitizeCoaster({ ...DEFAULTS, svgUse, patternMode, corkRecess, pattern: svgUse === 'shape' ? 'none' : 'hex', baseHeight: 1.6, corkDepth: 3, patternHeight: 3 });
  const { parts } = buildCoaster(M, p, artwork);
  const label = `svg/${svgUse}/${patternMode}/${corkRecess}`;
  const expectedParts = svgUse === 'shape' || patternMode === 'engrave' || (corkRecess && patternMode === 'inlay') ? 1 : 2;
  if (parts.length !== expectedParts) fail(`${label}: numero pezzi errato`);
  for (const part of parts) {
    const mesh = new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices });
    mesh.merge();
    const solid = new M.Manifold(mesh);
    try {
      if (solid.status() !== 'NoError' || solid.volume() <= 0) fail(`${label}: mesh non valida`);
      if (part.id === 'base' && Math.abs(solid.boundingBox().min[2]) > 1e-3) fail(`${label}: base sollevata`);
      // Il foro del disegno deve restare vuoto nel motivo e attraversare la sagoma.
      if (part.id !== 'base' || svgUse === 'shape') {
        const probe = M.Manifold.cylinder(20, 1, -1, 12);
        const hit = solid.intersect(probe);
        if (hit.volume() > 1e-5) fail(`${label}: foro SVG perso`);
        hit.delete(); probe.delete();
      }
    } finally { solid.delete(); }
  }
  if (!unzipSync(to3MF(parts))['3D/3dmodel.model'] || toSTL(parts).length < 84) fail(`${label}: export non valido`);
}
const volumeOf = (parts: import('@bdl/geometry').Part[]) => parts.reduce((sum, part) => {
  const mesh = new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices });
  mesh.merge();
  const solid = new M.Manifold(mesh);
  try { return sum + solid.volume(); } finally { solid.delete(); }
}, 0);
const blankVolume = volumeOf(buildCoaster(M, { ...DEFAULTS, pattern: 'none' }).parts);
for (const patternMode of ['inlay', 'engrave', 'relief'] as const) {
  const volume = volumeOf(buildCoaster(M, { ...DEFAULTS, svgUse: 'decoration', patternMode }, artwork).parts);
  if (patternMode === 'inlay' && Math.abs(volume - blankVolume) > 0.01) fail('svg: intarsio non riempie esattamente l’incavo');
  if (patternMode === 'engrave' && volume >= blankVolume - 1) fail('svg: incisione non asporta materiale');
  if (patternMode === 'relief' && volume <= blankVolume + 1) fail('svg: rilievo non aggiunge materiale');
}

try {
  buildCoaster(M, { ...DEFAULTS, svgUse: 'shape' }, { name: 'separati.svg', shapes: [
    [[[-0.5, -0.5], [-0.3, -0.5], [-0.3, -0.3], [-0.5, -0.3]]],
    [[[0.3, 0.3], [0.5, 0.3], [0.5, 0.5], [0.3, 0.5]]],
  ] });
  fail('svg: sagoma disconnessa accettata');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('connessa')) fail('svg: errore inatteso per sagoma disconnessa');
}

const lines = { name: 'linee.svg', filledShapes: [], shapes: [[[
  [-0.5, -0.05], [0.5, -0.05], [0.5, 0.05], [-0.5, 0.05],
]]] } as import('../apps/coaster/src/svg.ts').SvgArtwork;
for (const patternMode of ['inlay', 'relief', 'engrave'] as const) {
  runs++;
  const parts = buildCoaster(M, { ...DEFAULTS, svgUse: 'decoration', patternMode }, lines).parts;
  if (parts.length !== (patternMode === 'engrave' ? 1 : 2) || volumeOf(parts) <= 0) fail('svg: decorazione da linee non valida');
}
try {
  buildCoaster(M, { ...DEFAULTS, svgUse: 'shape' }, lines);
  fail('svg: sagoma senza riempimento accettata');
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes('aree piene')) fail('svg: errore inatteso per linee come sagoma');
}

const twoElements = { name: 'due.svg', shapes: [
  [[[-0.4, -0.1], [-0.2, -0.1], [-0.2, 0.1], [-0.4, 0.1]]],
  [[[0.2, -0.1], [0.4, -0.1], [0.4, 0.1], [0.2, 0.1]]],
] } as import('../apps/coaster/src/svg.ts').SvgArtwork;
for (const patternMode of ['inlay', 'relief', 'engrave'] as const) {
  runs++;
  const parts = buildCoaster(M, { ...DEFAULTS, svgUse: 'decoration', patternMode }, twoElements).parts;
  if (parts.length !== (patternMode === 'engrave' ? 1 : 3)) fail(`svg/${patternMode}: elementi non separati`);
  const original = parts.map((part) => new Float32Array(part.mesh.positions));
  const arranged = separateParts(parts);
  for (let i = 0; i < parts.length; i++) {
    const grounded = groundPart(parts[i]);
    if (Math.abs(bounds([grounded]).min[2]) > 1e-5 || Math.abs(bounds([arranged[i]]).min[2]) > 1e-5) fail('svg: pezzo separato non poggia sul piano');
    if (parts[i].mesh.positions.some((value, k) => value !== original[i][k])) fail('svg: vista separata modifica l’assemblato');
    const mesh = new M.Mesh({ numProp: 3, vertProperties: grounded.mesh.positions, triVerts: grounded.mesh.indices });
    mesh.merge(); const solid = new M.Manifold(mesh);
    if (solid.status() !== 'NoError' || solid.volume() <= 0) fail('svg: pezzo separato non valido');
    solid.delete();
    for (let j = 0; j < i; j++) {
      const a = bounds([arranged[i]]), b = bounds([arranged[j]]);
      if (a.min[0] < b.max[0] && a.max[0] > b.min[0] && a.min[1] < b.max[1] && a.max[1] > b.min[1]) fail('svg: pezzi separati sovrapposti');
    }
  }
  const model = strFromU8(unzipSync(to3MF(arranged))['3D/3dmodel.model']);
  if ((model.match(/<mesh>/g) ?? []).length !== parts.length) fail('svg: 3MF perde oggetti separati');
}

console.log(`${runs} combinazioni provate, ${failures} errori`);
process.exit(failures ? 1 : 0);
