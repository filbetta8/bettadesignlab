import '@bdl/ui-kit/style.css';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { loadManifold, bounds, type Part } from '@bdl/geometry';
import { createViewer } from '@bdl/viewer';
import { toSTL, to3MF, download, slug } from '@bdl/export';
import {
  appShell, section, slider, segmented, toggle, colorPicker, button, iconButton, toast,
  panelFooter, readHashState, writeHashState, rafThrottle, ICONS, el,
} from '@bdl/ui-kit';
import { buildCoaster } from './geometry.ts';
import { DEFAULTS, sanitize, type CoasterParams, type Pattern, type PatternMode } from './params.ts';

const shell = appShell({
  title: 'Sottobicchieri',
  intro: 'Scegli forma, bordo e motivo. Il motivo può essere in rilievo o a intarsio, in un secondo colore.',
});
let state: CoasterParams = sanitize(readHashState(DEFAULTS));
let parts: Part[] = [];

const viewer = createViewer(shell.stage);
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
  state = { ...state, [k]: v };
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
  options: [{ value: 'inlay', label: 'Intarsio (a filo)' }, { value: 'relief', label: 'Rilievo' }],
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
const showPatternRows = () => patternRows.forEach((r) => { r.hidden = state.pattern === 'none'; });

const corkDepthRow = slider({ label: 'Profondità incavo', min: 0.5, max: 3, step: 0.1, value: state.corkDepth, unit: 'mm', onInput: (v) => set('corkDepth', v) });
const showCork = () => { corkDepthRow.root.hidden = !state.corkRecess; };

shell.panel.append(
  section('Forma',
    shapeSeg.root,
    slider({ label: 'Dimensione', min: 60, max: 140, step: 1, value: state.size, unit: 'mm', onInput: (v) => set('size', v) }).root,
    cornerRow.root,
    slider({ label: 'Spessore base', min: 1.6, max: 8, step: 0.2, value: state.baseHeight, unit: 'mm', onInput: (v) => set('baseHeight', v) }).root,
  ),
  section('Bordo',
    slider({ label: 'Larghezza', min: 0, max: 10, step: 0.5, value: state.rimWidth, unit: 'mm', hint: '0 = senza bordo.', onInput: (v) => set('rimWidth', v) }).root,
    slider({ label: 'Altezza', min: 0, max: 5, step: 0.2, value: state.rimHeight, unit: 'mm', onInput: (v) => set('rimHeight', v) }).root,
  ),
  section('Motivo',
    el('div', { class: 'bdl-row' }, el('label', { for: 'pattern' }, 'Disegno'), patternSelect),
    ...patternRows,
  ),
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
showCorner(); showPatternRows(); showCork();

const fileBase = () => slug(`sottobicchiere-${state.shape}-${Math.round(state.size)}mm`);
shell.exportBar.append(
  button({ label: 'STL', icon: ICONS.download, onClick: () => { download(toSTL(parts), `${fileBase()}.stl`, 'model/stl'); toast('STL scaricato (pezzi uniti, un colore)'); } }),
  button({ label: '3MF multicolore', icon: ICONS.download, variant: 'primary', onClick: () => { download(to3MF(parts, { title: fileBase() }), `${fileBase()}.3mf`, 'model/3mf'); toast('3MF scaricato: assegna un filamento a ogni pezzo nello slicer'); } }),
);

async function copyLink() {
  try { await navigator.clipboard.writeText(location.href); toast('Link copiato'); }
  catch { toast('Copia non riuscita: usa la barra degli indirizzi'); }
}

// ---------- Ricostruzione ----------
const M = await loadManifold(wasmUrl);
let lastShapeKey = '';

function rebuild() {
  const t0 = performance.now();
  try {
    const p = sanitize(state);
    const res = buildCoaster(M, p);
    parts = res.parts;
    // Riposiziona la camera solo quando cambia l'ingombro, non a ogni slider.
    const key = `${p.shape}-${p.size}`;
    viewer.setParts(parts, { refit: key !== lastShapeKey });
    lastShapeKey = key;
    writeHashState(state, DEFAULTS);
    const b = bounds(parts);
    const dims = `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(b.max[2] - b.min[2]).toFixed(1)} mm`;
    const ms = Math.round(performance.now() - t0);
    if (res.warnings.length) shell.setStatus(res.warnings[0], 'warn');
    else shell.setStatus(`${dims} · ${parts.length} ${parts.length === 1 ? 'pezzo' : 'pezzi'} · ${ms} ms`);
  } catch (err) {
    console.error(err);
    shell.setStatus('Errore nella geometria: prova altri valori', 'warn');
  }
}
const schedule = rafThrottle(rebuild);
rebuild();
