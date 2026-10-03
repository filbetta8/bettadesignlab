import '@bdl/ui-kit/style.css';
import './hub.css';
import { BRAND } from '@bdl/brand';
import { el, initTheme, themeToggle } from '@bdl/ui-kit';
import registry from '../../generators.json';

interface Entry { id: string; name: string; status: 'live' | 'beta' | 'planned'; category: string; blurb: string; }

// Illustrazioni a linea per ogni prodotto (stesso stile, colore dal tema).
const a = (d: string) => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ART: Record<string, string> = {
  coaster: a('<ellipse cx="32" cy="34" rx="24" ry="12"/><path d="M8 34v4c0 6.6 10.7 12 24 12s24-5.4 24-12v-4"/><ellipse cx="32" cy="34" rx="17" ry="8"/><path d="M26 34l3-2 3 2 3-2 3 2"/>'),
  keychain: a('<circle cx="18" cy="18" r="8"/><rect x="22" y="24" width="32" height="16" rx="5" transform="rotate(35 38 32)"/><path d="M33 35l8 5"/>'),
  keycap: a('<path d="M12 22l8-8h24l8 8v22l-6 6H18l-6-6z"/><path d="M20 14l4 8h16l4-8M24 22l-4 22M40 22l4 22"/><path d="M28 32h8"/>'),
  magnet: a('<path d="M14 14h12v20a6 6 0 0 0 12 0V14h12v20a18 18 0 0 1-36 0z"/><path d="M14 22h12M38 22h12"/>'),
  foldbox: a('<path d="M10 22l22-10 22 10-22 10z"/><path d="M10 22v20l22 10 22-10V22M32 32v20"/>'),
  vase: a('<path d="M24 10h16M26 10c0 8-10 12-10 26 0 10 6 18 16 18s16-8 16-18c0-14-10-18-10-26"/><path d="M20 30c8 3 16 3 24 0"/>'),
  tray: a('<rect x="8" y="22" width="48" height="22" rx="8"/><path d="M14 22v-2a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v2M28 22v22"/>'),
  kitchen: a('<path d="M20 8v18a6 6 0 0 1-6 6v24M14 8v12M26 8v12"/><path d="M44 8c-6 4-6 16 0 22v26"/>'),
  'desk-organizer': a('<rect x="10" y="26" width="16" height="28" rx="2"/><rect x="26" y="34" width="28" height="20" rx="2"/><path d="M14 26V12M20 26V16M34 34V20l4-6 4 6v14"/>'),
};

initTheme();
const entries = (registry.generators as Entry[]).slice().sort((x, y) => Number(x.status === 'planned') - Number(y.status === 'planned'));

const card = (g: Entry) => {
  const live = g.status !== 'planned';
  const body = [
    el('span', { class: 'hub-badge', 'data-kind': live ? 'live' : 'planned' }, g.status === 'beta' ? 'Beta' : live ? 'Disponibile' : 'In arrivo'),
    el('div', { class: 'hub-art', html: ART[g.id] ?? ART.coaster }),
    el('div', { class: 'hub-body' },
      el('span', { class: 'hub-cat' }, g.category),
      el('span', { class: 'hub-name' }, g.name),
      el('span', { class: 'hub-blurb' }, g.blurb)),
  ];
  return live
    ? el('a', { class: 'hub-card', href: `./${g.id}/`, 'data-status': g.status }, ...body)
    : el('div', { class: 'hub-card', 'data-status': g.status, 'aria-disabled': 'true' }, ...body);
};

const liveCount = entries.filter((g) => g.status !== 'planned').length;
document.body.append(
  el('header', { class: 'bdl-topbar' },
    el('a', { class: 'bdl-logo', href: './' }, el('span', { class: 'bdl-logo-mark' }, 'b'), BRAND.name),
    el('span', { class: 'bdl-spacer' }),
    themeToggle()),
  el('main', { class: 'hub' },
    el('section', { class: 'hub-hero' },
      el('h1', {}, 'Oggetti su misura, pronti da stampare.'),
      el('p', {}, BRAND.tagline),
      el('div', { class: 'hub-facts' },
        el('span', { class: 'hub-fact' }, 'Gratis, senza account'),
        el('span', { class: 'hub-fact' }, 'Tutto nel browser'),
        el('span', { class: 'hub-fact' }, 'STL e 3MF multicolore'),
        el('span', { class: 'hub-fact' }, `${liveCount} di ${entries.length} generatori online`))),
    el('section', { class: 'hub-grid', 'aria-label': 'Generatori' }, ...entries.map(card)),
    el('footer', { class: 'hub-footer' }, `© ${BRAND.year} ${BRAND.name}. ${BRAND.license.free} ${BRAND.license.commercial}`)),
);
