// Test della geometria in Node: costruisce ogni combinazione di forma × motivo × tecnica
// e verifica che i pezzi siano solidi chiusi (manifold), non vuoti e nelle misure attese.
// Gira in CI e in locale con `pnpm test`.

import { loadManifold } from '@bdl/geometry';
import { buildCoaster } from '../apps/coaster/src/geometry.ts';
import { DEFAULTS, sanitize as sanitizeCoaster, type CoasterParams } from '../apps/coaster/src/params.ts';
import { buildVase } from '../apps/vase/src/geometry.ts';
import { DEFAULTS as VASE_DEFAULTS, sanitize } from '../apps/vase/src/params.ts';
import { stripSvgDoctype } from '../apps/coaster/src/svg.ts';
import { groundPart, separateParts } from '../apps/coaster/src/parts.ts';
import { bounds } from '@bdl/geometry';
import { unzipSync, strFromU8 } from 'fflate';
import { toSTL, to3MF } from '@bdl/export';
import { buildKeycap, buildFitTest } from '../apps/keycap/src/geometry.ts';
import { DEFAULTS as KEYCAP_DEFAULTS, sanitize as sanitizeKeycap } from '../apps/keycap/src/params.ts';
import { traceRaster } from '../apps/keycap/src/artwork.ts';
import { printPart as printKeycapPart, printAssembly as printKeycapAssembly } from '../apps/keycap/src/parts.ts';

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

const legacySvg = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd"><svg/>';
if (stripSvgDoctype(legacySvg) !== '<svg/>') fail('svg: DOCTYPE standard non rimosso');
try {
  stripSvgDoctype('<!DOCTYPE svg [<!ENTITY example "value">]><svg/>');
  fail('svg: entità XML accettate');
} catch { /* Le entità personalizzate non fanno parte dei tracciati SVG supportati. */ }

// Clicker: i pezzi restano chiusi, sede e croce aperte, corsa libera di 4 mm.
for (const shape of ['square', 'round', 'hex', 'artwork'] as const)
for (const mode of ['inlay', 'relief', 'engrave'] as const)
for (const switches of [1, 2, 3]) {
  runs++;
  const p = sanitizeKeycap({ ...KEYCAP_DEFAULTS, shape, mode, switches, size: 18, keychain: true });
  // Un anello ha il centro vuoto: il nucleo strutturale deve comunque reggere il socket.
  const res = buildKeycap(M, p, artwork);
  const solids = res.parts.map((part) => {
    const mesh = new M.Mesh({ numProp: 3, vertProperties: part.mesh.positions, triVerts: part.mesh.indices });
    mesh.merge(); const m = new M.Manifold(mesh);
    if (m.status() !== 'NoError' || m.volume() <= 0) fail(`clicker/${shape}/${mode}/${switches}/${part.id}: mesh non valida`);
    return m;
  });
  try {
    const base = solids[res.parts.findIndex((part) => part.id === 'base')];
    const cap = solids[res.parts.findIndex((part) => part.id === 'cap')];
    const pressed = cap.translate([0, 0, -4]);
    const hit = base.intersect(pressed);
    if (hit.volume() > 0.001) fail(`clicker/${shape}/${mode}/${switches}: pulsante collide con base durante la corsa`);
    hit.delete(); pressed.delete();
    for (let i = 0; i < switches; i++) {
      const x = (i - (switches - 1) / 2) * p.spacing;
      const stemProbe = M.Manifold.cylinder(3.5, 0.4, -1, 12);
      const stemAt = stemProbe.translate([x, 0, 13.4]);
      const stemHit = cap.intersect(stemAt);
      if (stemHit.volume() > 0.001) fail('clicker: socket MX chiuso');
      stemHit.delete(); stemAt.delete(); stemProbe.delete();
      const seatProbe = M.Manifold.cylinder(9.8, 1, -1, 12);
      const seatAt = seatProbe.translate([x, 0, 1.9]);
      const seatHit = base.intersect(seatAt);
      if (seatHit.volume() > 0.001) fail('clicker: sede switch chiusa');
      seatHit.delete(); seatAt.delete(); seatProbe.delete();
    }
    if (Math.abs(bounds(res.parts.filter((part) => part.id === 'base')).min[2]) > 0.001) fail('clicker: base sollevata');
    const model = strFromU8(unzipSync(to3MF(res.parts))['3D/3dmodel.model']);
    if ((model.match(/<mesh>/g) ?? []).length !== res.parts.length) fail('clicker: export perde pezzi');
    const printParts = printKeycapAssembly(res.parts, p.size);
    const printModel = strFromU8(unzipSync(to3MF(printParts))['3D/3dmodel.model']);
    if ((printModel.match(/<mesh>/g) ?? []).length !== res.parts.length || printModel.includes('NaN')) fail('clicker: 3MF di stampa non valido');
    for (const part of res.parts) {
      const ready = printKeycapPart(part);
      if (Math.abs(bounds([ready]).min[2]) > 0.001) fail('clicker: STL separato non sul piano');
      if (Math.abs(volumeOf([ready]) - volumeOf([part])) > 0.01) fail('clicker: orientazione cambia il volume o inverte le facce');
    }
  } finally { solids.forEach((m) => m.delete()); }
}
for (const stemFit of [-0.1, 0.35]) {
  runs++;
  const p = sanitizeKeycap({ ...KEYCAP_DEFAULTS, product: 'keycap', stemFit, switches: 3, size: NaN });
  const result = buildKeycap(M, p);
  if (result.parts.length !== 1 || p.switches !== 1 || volumeOf(result.parts) <= 0) fail('keycap: parametri/export non validi');
}
const fitTiles = buildFitTest(M, 0, KEYCAP_DEFAULTS.capColor);
if (fitTiles.length !== 5 || fitTiles.some((part) => Math.abs(bounds([part]).min[2]) > 0.001) || volumeOf(fitTiles) <= 0) fail('MX: campioni non validi');
// Tracciamento raster: il foro bianco centrale deve sopravvivere alla conversione.
const raster = { width: 3, height: 3, data: new Uint8ClampedArray(36) };
for (let i = 0; i < 9; i++) { raster.data[i * 4 + 3] = 255; if (i === 4) raster.data.fill(255, i * 4, i * 4 + 4); }
const traced = traceRaster(raster, 'ring.png', 180);
const rasterPieces = traced.shapes.map((rings) => M.CrossSection.ofPolygons(rings, 'EvenOdd'));
const ring = M.CrossSection.union(rasterPieces);
if (Math.abs(ring.area() - 8 / 9) > 0.001) fail('clicker: tracciamento raster perde il foro');
ring.delete(); rasterPieces.forEach((piece) => piece.delete());

console.log(`${runs} combinazioni provate, ${failures} errori`);
process.exit(failures ? 1 : 0);
