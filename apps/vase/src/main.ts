import '@bdl/ui-kit/style.css';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { bounds, loadManifold, type Part } from '@bdl/geometry';
import { createViewer } from '@bdl/viewer';
import { download, slug, to3MF, toSTL } from '@bdl/export';
import { appShell, button, colorPicker, ICONS, iconButton, panelFooter, rafThrottle, readHashState, section, segmented, slider, toggle, writeHashState } from '@bdl/ui-kit';
import { buildVase } from './geometry.ts';
import { DEFAULTS, sanitize, type VaseParams, type VaseProfile } from './params.ts';

const shell = appShell({ title: 'Vasi d’arredo', intro: 'Crea un vaso decorativo cilindrico o conico. Regola profilo, torsione e dettagli per la stampa 3D.' });
let state: VaseParams = sanitize(readHashState(DEFAULTS));
let parts: Part[] = [];
const viewer = createViewer(shell.stage);
shell.stageTools.append(
  iconButton({ label: 'Vista 3D', icon: ICONS.iso, onClick: () => viewer.setView('iso') }),
  iconButton({ label: 'Vista dall’alto', icon: ICONS.top, onClick: () => viewer.setView('top') }),
  iconButton({ label: 'Vista frontale', icon: ICONS.front, onClick: () => viewer.setView('front') }),
);

const set = <K extends keyof VaseParams>(key: K, value: VaseParams[K]) => { state = sanitize({ ...state, [key]: value }); syncControls(); exportButtons.forEach((b) => { b.disabled = true; }); schedule(); };
const drainageSize = slider({ label: 'Diametro foro', min: 3, max: 220, step: 1, value: state.drainageDiameter, unit: 'mm', onInput: (v) => set('drainageDiameter', v) });
const sideCount = slider({ label: 'Lati / ondulazioni', min: 3, max: 16, value: state.sides, onInput: (v) => set('sides', v) });
const waves = slider({ label: 'Profondità onde', min: 1, max: 14, value: state.waveDepth, unit: 'mm', onInput: (v) => set('waveDepth', v) });
const syncControls = () => {
  drainageSize.root.hidden = !state.drainageHole;
  drainageSize.setRange(3, sanitize({ ...state, drainageDiameter: 220 }).drainageDiameter);
  drainageSize.set(state.drainageDiameter);
  sideCount.root.hidden = state.profile === 'smooth';
  waves.root.hidden = state.profile !== 'wavy';
  waves.setRange(1, Math.min(14, state.bottomDiameter / 5));
  waves.set(state.waveDepth);
};

shell.panel.append(
  section('Misure',
    slider({ label: 'Diametro superiore', min: 50, max: 240, value: state.topDiameter, unit: 'mm', onInput: (v) => set('topDiameter', v) }).root,
    slider({ label: 'Diametro inferiore', min: 50, max: 220, value: state.bottomDiameter, unit: 'mm', onInput: (v) => set('bottomDiameter', v) }).root,
    slider({ label: 'Altezza', min: 60, max: 300, value: state.height, unit: 'mm', onInput: (v) => set('height', v) }).root,
    slider({ label: 'Spessore parete', min: 1.2, max: 5, step: 0.2, value: state.wall, unit: 'mm', hint: 'Spessore della sezione più stretta; cresce verso quella più larga.', onInput: (v) => set('wall', v) }).root,
    slider({ label: 'Spessore fondo', min: 1.6, max: 10, step: 0.2, value: state.bottomThickness, unit: 'mm', onInput: (v) => set('bottomThickness', v) }).root,
  ),
  section('Profilo',
    segmented<VaseProfile>({ label: 'Sezione', value: state.profile, options: [
      { value: 'smooth', label: 'Liscio' }, { value: 'faceted', label: 'Sfaccettato' }, { value: 'wavy', label: 'Ondulato' },
    ], onChange: (v) => set('profile', v) }).root,
    sideCount.root,
    waves.root,
    slider({ label: 'Torsione', min: -180, max: 180, step: 5, value: state.twist, unit: '°', onInput: (v) => set('twist', v) }).root,
  ),
  section('Fondo',
    toggle({ label: 'Foro di drenaggio', value: state.drainageHole, hint: 'Il foro attraversa il fondo. Senza foro, la tenuta dipende dalla stampa.', onChange: (v) => set('drainageHole', v) }).root,
    drainageSize.root,
  ),
  section('Colore', colorPicker({ label: 'Filamento', value: state.color, onChange: (v) => set('color', v) }).root),
  panelFooter(),
);
syncControls();

const fileBase = () => slug(`vaso-${state.topDiameter}x${state.height}mm`);
const exportButtons = [
  button({ label: 'STL', icon: ICONS.download, onClick: () => download(toSTL(parts), `${fileBase()}.stl`, 'model/stl') }),
  button({ label: '3MF', icon: ICONS.download, variant: 'primary', onClick: () => download(to3MF(parts, { title: fileBase() }), `${fileBase()}.3mf`, 'model/3mf') }),
];
exportButtons.forEach((b) => { b.disabled = true; });
shell.exportBar.append(...exportButtons);

let M: Awaited<ReturnType<typeof loadManifold>>;
const schedule = rafThrottle(() => { if (M) rebuild(); });
try {
  M = await loadManifold(wasmUrl);
  rebuild();
} catch (error) {
  console.error(error);
  shell.setStatus('Caricamento del motore 3D fallito: ricarica la pagina.', 'warn');
}
function rebuild() {
  try {
    const p = sanitize(state);
    const result = buildVase(M, p);
    if (!result.parts[0]?.mesh.indices.length) throw new Error('Vaso vuoto');
    parts = result.parts;
    state = p;
    exportButtons.forEach((b) => { b.disabled = false; });
    viewer.setParts(parts);
    writeHashState(p, DEFAULTS);
    const b = bounds(parts);
    shell.setStatus(result.warnings[0] ?? `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(b.max[2] - b.min[2]).toFixed(0)} mm`, result.warnings.length ? 'warn' : 'ok');
  } catch (error) {
    parts = [];
    exportButtons.forEach((b) => { b.disabled = true; });
    console.error(error);
    shell.setStatus('Errore nella geometria: prova altri valori', 'warn');
  }
}
