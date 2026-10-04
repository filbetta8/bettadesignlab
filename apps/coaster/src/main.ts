import '@bdl/ui-kit/style.css';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { loadManifold, bounds, type Part } from '@bdl/geometry';
import { createViewer } from '@bdl/viewer';
import { zipSync } from 'fflate';
import { groundPart, separateParts } from './parts.ts';
import { toSTL, to3MF, download, slug } from '@bdl/export';
import {
  appShell, section, slider, segmented, toggle, colorPicker, button, iconButton, toast,
  panelFooter, readHashState, writeHashState, rafThrottle, ICONS, el,
} from '@bdl/ui-kit';
import { buildCoaster } from './geometry.ts';
import { parseSvg, type SvgArtwork } from './svg.ts';
import { DEFAULTS, sanitize, type CoasterParams, type Pattern, type PatternMode } from './params.ts';

const shell = appShell({
  title: 'Sottobicchieri',
  intro: 'Scegli forma, bordo e motivo. Il motivo può essere in rilievo o a intarsio, in un secondo colore.',
});
let state: CoasterParams = sanitize(readHashState(DEFAULTS));
let parts: Part[] = [];
let artwork: SvgArtwork | undefined;
state.svgUse = 'none';

let selectedPart: string | null = null;
let separated = false;
const viewer = createViewer(shell.stage, { onSelectPart: (id) => { selectedPart = id; refreshPartList(); } });
shell.stageTools.append(
  iconButton({ label: 'Vista 3D', icon: ICONS.iso, onClick: () => viewer.setView('iso') }),
  iconButton({ label: 'Vista dall’alto', icon: ICONS.top, onClick: () => viewer.setView('top') }),
  iconButton({ label: 'Vista frontale', icon: ICONS.front, onClick: () => viewer.setView('front') }),
);

// ---------- Icone forme ----------
const shapeIcon = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${d}</svg>`;
const SHAPE_ICONS = {
  round: shapeIcon('<circle cx="12" cy="12" r="8"/>'),
  square: shapeIcon('<rect x="4" y="4" width="16" height="16" rx="3"/>'),
  hex: shapeIcon('<path d="M7.4 4h9.2l4.6 8-4.6 8H7.4L2.8 12z"/>'),
  oct: shapeIcon('<path d="M8.7 4h6.6L20 8.7v6.6L15.3 20H8.7L4 15.3V8.7z"/>'),
};

// ---------- Controlli ----------
const set = <K extends keyof CoasterParams>(k: K, v: CoasterParams[K]) => {
  state = sanitize({ ...state, [k]: v });
  syncSvgControls();
  exportButtons.forEach((b) => { b.disabled = true; });
  selectedExport.disabled = separateExport.disabled = true;
  schedule();
};

const cornerRow = slider({ label: 'Raggio angoli', min: 0, max: 30, step: 1, value: state.cornerRadius, unit: 'mm', onInput: (v) => set('cornerRadius', v) });
const showCorner = () => { cornerRow.root.hidden = state.shape !== 'square'; };

const shapeSeg = segmented({
  label: 'Forma',
  options: [
    { value: 'round', label: 'Tondo', icon: SHAPE_ICONS.round },
    { value: 'square', label: 'Quadro', icon: SHAPE_ICONS.square },
    { value: 'hex', label: 'Esagono', icon: SHAPE_ICONS.hex },
    { value: 'oct', label: 'Ottagono', icon: SHAPE_ICONS.oct },
  ],
  value: state.shape,
  onChange: (v) => { set('shape', v); showCorner(); },
});

const patternSelect = el('select', { class: 'bdl-select', id: 'pattern' },
  ...([
    ['none', 'Nessuno'], ['hex', 'Nido d’ape'], ['rings', 'Anelli'], ['stripes', 'Righe'],
    ['grid', 'Griglia'], ['waves', 'Onde'], ['dots', 'Pois'],
  ] as const).map(([v, l]) => el('option', { value: v }, l)));
patternSelect.value = state.pattern;
patternSelect.addEventListener('change', () => { set('pattern', patternSelect.value as Pattern); showPatternRows(); });

const modeSeg = segmented<PatternMode>({
  label: 'Tecnica',
  options: [{ value: 'inlay', label: 'Intarsio (a filo)' }, { value: 'relief', label: 'Rilievo' }, { value: 'engrave', label: 'Incisione (vuota)' }],
  value: state.patternMode,
  onChange: (v) => set('patternMode', v),
});
const patternRows = [
  modeSeg.root,
  slider({ label: 'Profondità / altezza', min: 0.2, max: 2, step: 0.2, value: state.patternHeight, unit: 'mm', hint: 'Per l’intarsio usa multipli dell’altezza layer (0,2 mm).', onInput: (v) => set('patternHeight', v) }).root,
  slider({ label: 'Passo', min: 4, max: 20, step: 0.5, value: state.spacing, unit: 'mm', onInput: (v) => set('spacing', v) }).root,
  slider({ label: 'Spessore linee', min: 0.8, max: 4, step: 0.1, value: state.lineWidth, unit: 'mm', hint: 'Almeno 2× il diametro dell’ugello (0,4 → 0,8 mm).', onInput: (v) => set('lineWidth', v) }).root,
  slider({ label: 'Rotazione', min: 0, max: 180, step: 5, value: state.angle, unit: '°', onInput: (v) => set('angle', v) }).root,
];
const showPatternRows = () => patternRows.forEach((r, i) => {
  r.hidden = state.svgUse === 'decoration' ? i === 2 || i === 3 : state.pattern === 'none';
});
const svgInput = el('input', { type: 'file', accept: '.svg,image/svg+xml', id: 'svg-file', class: 'bdl-select' });
const svgName = el('p', { class: 'bdl-hint', role: 'status' }, 'Nessun SVG caricato.');
const svgMode = segmented<CoasterParams['svgUse']>({
  label: 'Usa SVG come', value: state.svgUse,
  options: [{ value: 'none', label: 'Disattivato' }, { value: 'decoration', label: 'Decorazione' }, { value: 'shape', label: 'Sagoma' }],
  onChange: (v) => {
    if (v !== 'none' && !artwork) { svgMode.set(state.svgUse); toast('Carica prima un file SVG.'); return; }
    if (v === 'shape' && artwork?.filledShapes?.length === 0) { svgMode.set(state.svgUse); toast('Per la sagoma serve un SVG con aree piene.'); return; }
    set('svgUse', v);
  },
});
const svgScaleRow = slider({ label: 'Dimensione SVG', min: 10, max: 100, step: 1, value: state.svgScale, unit: '%', onInput: (v) => set('svgScale', v) });
const clearanceRow = slider({ label: 'Gioco intarsio', min: 0, max: 0.5, step: 0.05, value: state.svgClearance, unit: 'mm', hint: '0 per stampa multicolore; aumenta il gioco per inserire pezzi stampati separatamente.', onInput: (v) => set('svgClearance', v) });
function syncSvgControls() {
  clearanceRow.root.hidden = state.svgUse !== 'decoration' || state.patternMode !== 'inlay';
  svgScaleRow.root.hidden = state.svgUse !== 'decoration';
  shapeSeg.root.hidden = state.svgUse === 'shape';
  cornerRow.root.hidden = state.svgUse === 'shape' || state.shape !== 'square';
  patternSelect.disabled = state.svgUse === 'decoration';
  showPatternRows();
}
let importVersion = 0;
svgInput.addEventListener('change', async () => {
  const file = svgInput.files?.[0];
  const version = ++importVersion;
  if (!file) return;
  try {
    if (file.size > 500_000) throw new Error('SVG troppo grande: massimo 500 KB.');
    const parsed = parseSvg(await file.text(), file.name);
    if (version !== importVersion) return;
    selectedPart = null;
    artwork = parsed;
    svgName.textContent = file.name;
    svgMode.set('decoration');
    set('svgUse', 'decoration');
  } catch (error) {
    if (version !== importVersion) return;
    svgName.textContent = error instanceof Error ? error.message : 'Caricamento SVG non riuscito.';
  }
  svgInput.value = '';
});

const corkDepthRow = slider({ label: 'Profondità incavo', min: 0.5, max: 3, step: 0.1, value: state.corkDepth, unit: 'mm', onInput: (v) => set('corkDepth', v) });
const showCork = () => { corkDepthRow.root.hidden = !state.corkRecess; };

const partList = el('div', { class: 'bdl-row', role: 'group', 'aria-label': 'Pezzi del modello' });
const selectionLabel = el('p', { class: 'bdl-hint', role: 'status' }, 'Clicca un pezzo nell’anteprima oppure nell’elenco.');
const selectedExport = button({ label: 'STL selezionato', size: 'sm', onClick: () => {
  const part = parts.find((part) => part.id === selectedPart);
  if (part) download(toSTL([groundPart(part)]), `${fileBase()}-${slug(part.name)}.stl`, 'model/stl');
} });
const separateExport = button({ label: 'Tutti gli STL separati (ZIP)', size: 'sm', onClick: () => {
  const files: Record<string, Uint8Array> = {};
  parts.forEach((part) => { files[`${slug(part.name)}-${part.id}.stl`] = toSTL([groundPart(part)]); });
  download(zipSync(files), `${fileBase()}-pezzi.zip`, 'application/zip');
} });
const layoutSeg = segmented({ label: 'Vista pezzi', value: 'assembled', options: [
  { value: 'assembled', label: 'Assemblata' }, { value: 'separated', label: 'Separata' },
], onChange: (value) => { separated = value === 'separated'; updatePreview(true); } });
function updatePreview(refit = false) {
  viewer.setParts(separated ? separateParts(parts) : parts, { refit });
  viewer.selectPart(selectedPart);
}
function refreshPartList() {
  if (!parts.some((part) => part.id === selectedPart)) selectedPart = null;
  partList.replaceChildren(...parts.map((part) => {
    const control = button({ label: part.name, size: 'sm', onClick: () => { selectedPart = part.id; viewer.selectPart(part.id); refreshPartList(); } });
    control.setAttribute('aria-pressed', String(part.id === selectedPart));
    return control;
  }));
  selectionLabel.textContent = selectedPart ? `Selezionato: ${parts.find((part) => part.id === selectedPart)!.name}` : 'Clicca un pezzo nell’anteprima oppure nell’elenco.';
  selectedExport.disabled = !selectedPart;
  separateExport.disabled = !parts.length;
}

shell.panel.append(
  section('Forma',
    shapeSeg.root,
    slider({ label: 'Dimensione', min: 60, max: 140, step: 1, value: state.size, unit: 'mm', onInput: (v) => set('size', v) }).root,
    cornerRow.root,
    slider({ label: 'Spessore base', min: 1.6, max: 8, step: 0.2, value: state.baseHeight, unit: 'mm', onInput: (v) => set('baseHeight', v) }).root,
  ),
  section('SVG personale',
    el('div', { class: 'bdl-row' }, el('label', { for: 'svg-file' }, 'Carica SVG'), svgInput),
    svgName, svgMode.root, svgScaleRow.root, clearanceRow.root,
    el('p', { class: 'bdl-hint' }, 'Decorazione: aree piene e linee, con lo spessore originale. Sagoma: solo aree piene; converti i testi in tracciati. Il file resta sul tuo dispositivo e va ricaricato dopo un aggiornamento della pagina; non è incluso nei link. La sagoma richiede una forma connessa.'),
    button({ label: 'Rimuovi SVG', variant: 'ghost', size: 'sm', onClick: () => {
      importVersion++; artwork = undefined; svgName.textContent = 'Nessun SVG caricato.'; svgMode.set('none'); set('svgUse', 'none');
    } }),
  ),
  section('Bordo',
    slider({ label: 'Larghezza', min: 0, max: 10, step: 0.5, value: state.rimWidth, unit: 'mm', hint: '0 = senza bordo.', onInput: (v) => set('rimWidth', v) }).root,
    slider({ label: 'Altezza', min: 0, max: 5, step: 0.2, value: state.rimHeight, unit: 'mm', onInput: (v) => set('rimHeight', v) }).root,
  ),
  section('Motivo',
    el('div', { class: 'bdl-row' }, el('label', { for: 'pattern' }, 'Disegno'), patternSelect),
    ...patternRows,
  ),
  section('Pezzi', layoutSeg.root, selectionLabel, partList, selectedExport, separateExport,
    el('p', { class: 'bdl-hint' }, 'Gli elementi SVG connessi diventano pezzi distinti. Le linee o forme che si toccano sono unite. L’incisione crea cavità, senza inserti separabili. Gli STL separati poggiano sul piano; il 3MF segue la vista scelta.')),
  section('Colori',
    colorPicker({ label: 'Base', value: state.baseColor, onChange: (v) => set('baseColor', v) }).root,
    colorPicker({ label: 'Motivo', value: state.patternColor, onChange: (v) => set('patternColor', v) }).root,
  ),
  section('Sotto',
    toggle({ label: 'Incavo per sughero/feltro', value: state.corkRecess, hint: 'Lascia una sede sotto per incollare un disco antiscivolo.', onChange: (v) => { set('corkRecess', v); showCork(); } }).root,
    corkDepthRow.root,
  ),
  section('Azioni',
    el('div', { class: 'bdl-row', style: 'grid-auto-flow: column; justify-content: start; gap: 8px' },
      button({ label: 'Copia link', icon: ICONS.link, size: 'sm', onClick: copyLink }),
      button({ label: 'Ripristina', icon: ICONS.reset, size: 'sm', variant: 'ghost', onClick: () => { location.hash = ''; location.reload(); } }),
    ),
  ),
  panelFooter(),
);
showCorner(); showPatternRows(); showCork(); syncSvgControls(); refreshPartList();

const fileBase = () => slug(`sottobicchiere-${state.shape}-${Math.round(state.size)}mm`);
const exportButtons = [
  button({ label: 'STL', icon: ICONS.download, onClick: () => { download(toSTL(parts), `${fileBase()}.stl`, 'model/stl'); toast('STL scaricato (pezzi uniti, un colore)'); } }),
  button({ label: '3MF multicolore', icon: ICONS.download, variant: 'primary', onClick: () => { download(to3MF(separated ? separateParts(parts) : parts, { title: fileBase() }), `${fileBase()}.3mf`, 'model/3mf'); toast('3MF scaricato: assegna un filamento a ogni pezzo nello slicer'); } }),
];
exportButtons.forEach((b) => { b.disabled = true; });
shell.exportBar.append(...exportButtons);

async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast(artwork ? 'Link copiato: include i parametri, ma l’SVG va ricaricato.' : 'Link copiato'); }
  catch { toast('Copia non riuscita: usa la barra degli indirizzi'); }
}

// ---------- Ricostruzione ----------
let M: Awaited<ReturnType<typeof loadManifold>>;
const schedule = rafThrottle(() => { if (M) rebuild(); });
let lastShapeKey = '';

function rebuild() {
  const t0 = performance.now();
  try {
    const p = sanitize(state);
    const res = buildCoaster(M, p, artwork);
    if (!res.parts[0]?.mesh.indices.length) throw new Error('Geometria vuota.');
    parts = res.parts;
    state = p;
    // Riposiziona la camera solo quando cambia l'ingombro, non a ogni slider.
    const key = `${p.svgUse}-${artwork?.name}-${p.shape}-${p.size}`;
    refreshPartList();
    updatePreview(key !== lastShapeKey);
    lastShapeKey = key;
    writeHashState({ ...state, svgUse: 'none' }, DEFAULTS);
    exportButtons.forEach((b) => { b.disabled = false; });
    const b = bounds(parts);
    const dims = `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(b.max[2] - b.min[2]).toFixed(1)} mm`;
    const ms = Math.round(performance.now() - t0);
    if (res.warnings.length) shell.setStatus(res.warnings[0], 'warn');
    else shell.setStatus(`${dims} · ${parts.length} ${parts.length === 1 ? 'pezzo' : 'pezzi'} · ${ms} ms`);
  } catch (err) {
    console.error(err);
    parts = [];
    viewer.setParts([]);
    refreshPartList();
    exportButtons.forEach((b) => { b.disabled = true; });
    shell.setStatus(err instanceof Error ? err.message : 'Errore nella geometria: prova altri valori', 'warn');
  }
}
try {
  M = await loadManifold(wasmUrl);
  rebuild();
} catch (error) {
  console.error(error);
  shell.setStatus('Caricamento del motore 3D fallito: ricarica la pagina.', 'warn');
}
