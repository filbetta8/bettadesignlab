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

const set = <K extends keyof VaseParams>(key: K, value: VaseParams[K]) => { state = { ...state, [key]: value }; schedule(); };
const drainageSize = slider({ label: 'Diametro foro', min: 3, max: 40, step: 1, value: state.drainageDiameter, unit: 'mm', onInput: (v) => set('drainageDiameter', v) });
const showDrainage = () => { drainageSize.root.hidden = !state.drainageHole; };

shell.panel.append(
  section('Misure',
    slider({ label: 'Diametro superiore', min: 50, max: 240, value: state.topDiameter, unit: 'mm', onInput: (v) => set('topDiameter', v) }).root,
    slider({ label: 'Diametro inferiore', min: 50, max: 220, value: state.bottomDiameter, unit: 'mm', onInput: (v) => set('bottomDiameter', v) }).root,
    slider({ label: 'Altezza', min: 60, max: 300, value: state.height, unit: 'mm', onInput: (v) => set('height', v) }).root,
    slider({ label: 'Spessore parete', min: 1.2, max: 5, step: 0.2, value: state.wall, unit: 'mm', onInput: (v) => set('wall', v) }).root,
    slider({ label: 'Spessore fondo', min: 1.6, max: 10, step: 0.2, value: state.bottomThickness, unit: 'mm', onInput: (v) => set('bottomThickness', v) }).root,
  ),
  section('Profilo',
    segmented<VaseProfile>({ label: 'Sezione', value: state.profile, options: [
      { value: 'smooth', label: 'Liscio' }, { value: 'faceted', label: 'Sfaccettato' }, { value: 'wavy', label: 'Ondulato' },
    ], onChange: (v) => set('profile', v) }).root,
    slider({ label: 'Lati / ondulazioni', min: 3, max: 16, value: state.sides, onInput: (v) => set('sides', v) }).root,
    slider({ label: 'Profondità onde', min: 1, max: 14, value: state.waveDepth, unit: 'mm', onInput: (v) => set('waveDepth', v) }).root,
    slider({ label: 'Torsione', min: -180, max: 180, step: 5, value: state.twist, unit: '°', onInput: (v) => set('twist', v) }).root,
  ),
  section('Fondo',
    toggle({ label: 'Foro di drenaggio', value: state.drainageHole, hint: 'Disattivato: il vaso resta solo decorativo.', onChange: (v) => { set('drainageHole', v); showDrainage(); } }).root,
    drainageSize.root,
  ),
  section('Colore', colorPicker({ label: 'Filamento', value: state.color, onChange: (v) => set('color', v) }).root),
  panelFooter(),
);
showDrainage();

const fileBase = () => slug(`vaso-${state.topDiameter}x${state.height}mm`);
shell.exportBar.append(
  button({ label: 'STL', icon: ICONS.download, onClick: () => download(toSTL(parts), `${fileBase()}.stl`, 'model/stl') }),
  button({ label: '3MF', icon: ICONS.download, variant: 'primary', onClick: () => download(to3MF(parts, { title: fileBase() }), `${fileBase()}.3mf`, 'model/3mf') }),
);

const M = await loadManifold(wasmUrl);
function rebuild() {
  try {
    const p = sanitize(state);
    const result = buildVase(M, p);
    parts = result.parts;
    viewer.setParts(parts);
    writeHashState(p, DEFAULTS);
    const b = bounds(parts);
    shell.setStatus(result.warnings[0] ?? `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(b.max[2] - b.min[2]).toFixed(0)} mm`, result.warnings.length ? 'warn' : 'ok');
  } catch (error) {
    console.error(error);
    shell.setStatus('Errore nella geometria: prova altri valori', 'warn');
  }
}
const schedule = rafThrottle(rebuild);
rebuild();
