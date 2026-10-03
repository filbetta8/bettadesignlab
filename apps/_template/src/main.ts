import '@bdl/ui-kit/style.css';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { loadManifold, bounds, type Part } from '@bdl/geometry';
import { createViewer } from '@bdl/viewer';
import { toSTL, to3MF, download, slug } from '@bdl/export';
import {
  appShell, section, slider, colorPicker, button, iconButton, toast, panelFooter,
  readHashState, writeHashState, rafThrottle, ICONS,
} from '@bdl/ui-kit';
import { build } from './geometry.ts';
import { DEFAULTS, sanitize, type Params } from './params.ts';

const TITLE = '__NAME__';
const shell = appShell({ title: TITLE, intro: '__BLURB__' });
let state: Params = sanitize(readHashState(DEFAULTS));
let parts: Part[] = [];

const viewer = createViewer(shell.stage);
shell.stageTools.append(
  iconButton({ label: 'Vista 3D', icon: ICONS.iso, onClick: () => viewer.setView('iso') }),
  iconButton({ label: 'Vista dall’alto', icon: ICONS.top, onClick: () => viewer.setView('top') }),
  iconButton({ label: 'Vista frontale', icon: ICONS.front, onClick: () => viewer.setView('front') }),
);

const set = <K extends keyof Params>(k: K, v: Params[K]) => { state = { ...state, [k]: v }; schedule(); };

shell.panel.append(
  section('Misure',
    slider({ label: 'Larghezza', min: 20, max: 250, value: state.width, unit: 'mm', onInput: (v) => set('width', v) }).root,
    slider({ label: 'Profondità', min: 20, max: 250, value: state.depth, unit: 'mm', onInput: (v) => set('depth', v) }).root,
    slider({ label: 'Altezza', min: 5, max: 200, value: state.height, unit: 'mm', onInput: (v) => set('height', v) }).root,
    slider({ label: 'Parete', min: 0.8, max: 6, step: 0.2, value: state.wall, unit: 'mm', onInput: (v) => set('wall', v) }).root,
    slider({ label: 'Raggio angoli', min: 0, max: 30, value: state.radius, unit: 'mm', onInput: (v) => set('radius', v) }).root,
  ),
  section('Colore', colorPicker({ label: 'Filamento', value: state.color, onChange: (v) => set('color', v) }).root),
  panelFooter(),
);

const fileBase = () => slug(`${TITLE}-${state.width}x${state.depth}x${state.height}`);
shell.exportBar.append(
  button({ label: 'STL', icon: ICONS.download, onClick: () => download(toSTL(parts), `${fileBase()}.stl`, 'model/stl') }),
  button({ label: '3MF', icon: ICONS.download, variant: 'primary', onClick: () => { download(to3MF(parts, { title: fileBase() }), `${fileBase()}.3mf`, 'model/3mf'); toast('3MF scaricato'); } }),
);

const M = await loadManifold(wasmUrl);
function rebuild() {
  try {
    const res = build(M, sanitize(state));
    parts = res.parts;
    viewer.setParts(parts);
    writeHashState(state, DEFAULTS);
    const b = bounds(parts);
    shell.setStatus(res.warnings[0] ?? `${(b.max[0] - b.min[0]).toFixed(0)} × ${(b.max[1] - b.min[1]).toFixed(0)} × ${(b.max[2] - b.min[2]).toFixed(1)} mm`, res.warnings.length ? 'warn' : 'ok');
  } catch (err) {
    console.error(err);
    shell.setStatus('Errore nella geometria: prova altri valori', 'warn');
  }
}
const schedule = rafThrottle(rebuild);
rebuild();
