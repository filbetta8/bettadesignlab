// Componenti UI condivisi. Ogni controllo di ogni generatore viene da qui, così il sito
// resta un prodotto unico e non dieci app che si somigliano.

import { BRAND, FILAMENTS } from '@bdl/brand';

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

const svg = (paths: string, vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  iso: svg('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'),
  top: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="1.5"/>'),
  front: svg('<rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M3 20h18"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
} as const;

// ---------- Tema ----------

const THEME_KEY = 'bdl-theme';
export function initTheme(): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* modalità privata */ }
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
}
function currentTheme(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function themeToggle(): HTMLButtonElement {
  const b = el('button', { class: 'bdl-btn bdl-icon-btn', 'data-variant': 'ghost', type: 'button' });
  const paint = () => {
    const dark = currentTheme() === 'dark';
    b.innerHTML = dark ? ICONS.sun : ICONS.moon;
    b.setAttribute('aria-label', dark ? 'Tema chiaro' : 'Tema scuro');
    b.title = b.getAttribute('aria-label')!;
  };
  b.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignora */ }
    paint();
  });
  paint();
  return b;
}

// ---------- Cornice ----------

export function topbar(title?: string): HTMLElement {
  return el(
    'header',
    { class: 'bdl-topbar' },
    el('a', { class: 'bdl-logo', href: BRAND.urls.hub.startsWith('./') ? '../' : BRAND.urls.hub },
      el('span', { class: 'bdl-logo-mark' }, 'b'), BRAND.name),
    title ? el('span', { class: 'bdl-topbar-title' }, title) : null,
    el('span', { class: 'bdl-spacer' }),
    themeToggle(),
  );
}

export interface AppShell {
  panel: HTMLElement;
  stage: HTMLElement;
  stageTools: HTMLElement;
  exportBar: HTMLElement;
  setStatus(text: string, kind?: 'ok' | 'busy' | 'warn'): void;
}

/** Layout standard di un generatore: pannello controlli a sinistra, anteprima a destra. */
export function appShell(opts: { title: string; intro: string }): AppShell {
  initTheme();
  const panel = el('aside', { class: 'bdl-panel', 'aria-label': 'Impostazioni' },
    el('div', { class: 'bdl-intro' }, el('h1', {}, opts.title), el('p', {}, opts.intro)));
  const stageTools = el('div', { class: 'bdl-stage-tools' });
  const status = el('div', { class: 'bdl-status', role: 'status', 'aria-live': 'polite' }, 'Caricamento…');
  const exportBar = el('div', { class: 'bdl-export' });
  const stage = el('section', { class: 'bdl-stage', 'aria-label': 'Anteprima 3D' },
    stageTools, el('div', { class: 'bdl-stage-bottom' }, status, el('span', { class: 'bdl-spacer' }), exportBar));
  const app = el('div', { class: 'bdl-app' }, topbar(opts.title), el('main', { class: 'bdl-main' }, panel, stage));
  document.body.append(app);
  document.title = `${opts.title} · ${BRAND.name}`;
  return {
    panel, stage, stageTools, exportBar,
    setStatus(text, kind = 'ok') { status.textContent = text; status.dataset.kind = kind; },
  };
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return el('div', { class: 'bdl-section' }, el('h2', { class: 'bdl-section-title' }, title), ...children);
}

export function panelFooter(): HTMLElement {
  return el('div', { class: 'bdl-panel-footer' }, `${BRAND.license.free} ${BRAND.license.commercial}`);
}

// ---------- Controlli ----------

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  hint?: string;
  onInput: (v: number) => void;
}
export interface SliderRow { root: HTMLElement; set(v: number): void; setRange(min: number, max: number): void; }

export function slider(o: SliderOptions): SliderRow {
  const id = nextId('s');
  const step = o.step ?? 1;
  const decimals = (String(step).split('.')[1] ?? '').length;
  const out = el('span', { class: 'bdl-row-value' });
  const input = el('input', { class: 'bdl-range', type: 'range', id, min: o.min, max: o.max, step, value: o.value });
  const paint = () => {
    const v = Number(input.value);
    out.textContent = `${v.toFixed(decimals)}${o.unit ? ` ${o.unit}` : ''}`;
    const p = ((v - Number(input.min)) / (Number(input.max) - Number(input.min) || 1)) * 100;
    input.style.setProperty('--p', `${p}%`);
  };
  input.addEventListener('input', () => { paint(); o.onInput(Number(input.value)); });
  paint();
  const root = el('div', { class: 'bdl-row' },
    el('div', { class: 'bdl-row-head' }, el('label', { for: id }, o.label), out),
    input,
    o.hint ? el('p', { class: 'bdl-hint' }, o.hint) : null);
  return {
    root,
    set(v) { input.value = String(v); paint(); },
    setRange(min, max) { input.min = String(min); input.max = String(max); paint(); },
  };
}

export interface SegOption<T extends string> { value: T; label: string; icon?: string; }
export function segmented<T extends string>(o: {
  label?: string; options: SegOption<T>[]; value: T; onChange: (v: T) => void;
}): { root: HTMLElement; set(v: T): void } {
  const buttons = o.options.map((opt) => {
    const b = el('button', { type: 'button', 'aria-pressed': String(opt.value === o.value), title: opt.label });
    if (opt.icon) b.innerHTML = opt.icon;
    b.append(el('span', {}, opt.label));
    b.addEventListener('click', () => { set(opt.value); o.onChange(opt.value); });
    return b;
  });
  const set = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(o.options[i].value === v)));
  const group = el('div', { class: 'bdl-seg', role: 'group', 'aria-label': o.label ?? '' }, ...buttons);
  const root = o.label
    ? el('div', { class: 'bdl-row' }, el('div', { class: 'bdl-row-head' }, el('span', {}, o.label)), group)
    : el('div', { class: 'bdl-row' }, group);
  return { root, set };
}

export function toggle(o: { label: string; value: boolean; hint?: string; onChange: (v: boolean) => void }): { root: HTMLElement; set(v: boolean): void } {
  const input = el('input', { type: 'checkbox', role: 'switch' });
  input.checked = o.value;
  input.addEventListener('change', () => o.onChange(input.checked));
  const root = el('div', { class: 'bdl-row' },
    el('label', { class: 'bdl-toggle' }, el('span', {}, o.label), input),
    o.hint ? el('p', { class: 'bdl-hint' }, o.hint) : null);
  return { root, set(v) { input.checked = v; } };
}

export function colorPicker(o: { label: string; value: string; onChange: (hex: string) => void }): { root: HTMLElement; set(v: string): void } {
  const name = el('span', { class: 'bdl-row-value' });
  const sw = FILAMENTS.map((f) => {
    const b = el('button', { type: 'button', class: 'bdl-swatch', title: f.name, 'aria-label': f.name, style: `background:${f.hex}` });
    b.addEventListener('click', () => { set(f.hex); o.onChange(f.hex); });
    return b;
  });
  const set = (hex: string) => {
    sw.forEach((b, i) => b.setAttribute('aria-pressed', String(FILAMENTS[i].hex === hex)));
    name.textContent = FILAMENTS.find((f) => f.hex === hex)?.name ?? hex;
  };
  set(o.value);
  return {
    root: el('div', { class: 'bdl-row' }, el('div', { class: 'bdl-row-head' }, el('span', {}, o.label), name), el('div', { class: 'bdl-swatches' }, ...sw)),
    set,
  };
}

export function button(o: { label: string; icon?: string; variant?: 'primary' | 'ghost'; size?: 'sm'; title?: string; onClick: () => void }): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'bdl-btn', 'data-variant': o.variant, 'data-size': o.size, title: o.title });
  if (o.icon) b.innerHTML = o.icon;
  b.append(o.label);
  b.addEventListener('click', o.onClick);
  return b;
}

export function iconButton(o: { label: string; icon: string; onClick: () => void }): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'bdl-btn bdl-icon-btn', title: o.label, 'aria-label': o.label, html: o.icon });
  b.addEventListener('click', o.onClick);
  return b;
}

let toastHost: HTMLElement | null = null;
export function toast(text: string, ms = 2600): void {
  if (!toastHost) { toastHost = el('div', { class: 'bdl-toast-host', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const t = el('div', { class: 'bdl-toast' }, text);
  toastHost.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- Stato nell'URL (preset condivisibili) ----------

/** Legge i parametri dall'hash dell'URL sopra ai default, solo per chiavi note e dello stesso tipo. */
export function readHashState<T extends Record<string, string | number | boolean>>(defaults: T): T {
  const out = { ...defaults };
  const params = new URLSearchParams(location.hash.slice(1));
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const raw = params.get(key);
    if (raw === null) continue;
    const d = defaults[key];
    if (typeof d === 'number') { const n = Number(raw); if (Number.isFinite(n)) (out[key] as number) = n; }
    else if (typeof d === 'boolean') (out[key] as boolean) = raw === '1';
    else (out[key] as string) = raw;
  }
  return out;
}

/** Scrive nell'hash solo i valori diversi dal default, per link brevi. */
export function writeHashState<T extends Record<string, string | number | boolean>>(state: T, defaults: T): void {
  const params = new URLSearchParams();
  for (const key of Object.keys(state)) {
    const v = state[key];
    if (v === defaults[key]) continue;
    params.set(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  const hash = params.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

/** Esegue `fn` al massimo una volta per frame, con l'ultimo valore richiesto. */
export function rafThrottle(fn: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  };
}
