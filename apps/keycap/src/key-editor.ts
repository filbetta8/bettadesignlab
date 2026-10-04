import { el, section, button, segmented, toast } from '@bdl/ui-kit';
import { KEY_ICONS, findKeyIcon, keyLabelName, keyIconSvg } from './icons.ts';
import { readKeyLabels, type Params } from './params.ts';

export function createKeyEditor(get: () => Params, update: (labels: string) => void, layout: (value: Params['keyLayout']) => void) {
  let active = 0;
  const phrase = el('input', { class: 'bdl-input', type: 'text', id: 'keycap-phrase', placeholder: 'FILI', maxlength: '32' });
  const content = el('input', { class: 'bdl-input', type: 'text', id: 'keycap-key-label', maxlength: '24', placeholder: 'Lettera, testo o simbolo' });
  const list = el('div', { class: 'bdl-choice-grid', role: 'group', 'aria-label': 'Tasti con testo' });
  const direction = segmented<Params['keyLayout']>({ label: 'Disposizione tasti', value: get().keyLayout, options: [{ value: 'horizontal', label: 'Orizzontale' }, { value: 'vertical', label: 'Verticale' }], onChange: layout });
  const change = () => { const labels = readKeyLabels(get().keyLabels); labels[active] = content.value; update(JSON.stringify(labels)); };
  content.addEventListener('change', change);
  const remove = button({ label: 'Elimina tasto', onClick: () => { const labels = readKeyLabels(get().keyLabels); if (labels.length === 1) return; labels.splice(active, 1); active = Math.min(active, labels.length - 1); update(JSON.stringify(labels)); } });
  const search = el('input', { class: 'bdl-input', type: 'search', placeholder: 'Cerca: cuore, gatto, musica…', 'aria-label': 'Cerca icone' });
  const iconGrid = el('div', { class: 'bdl-icon-library', role: 'group', 'aria-label': 'Libreria di icone' });
  const empty = el('p', { class: 'bdl-hint' }, 'Nessuna icona trovata. Prova un’altra parola.');
  const iconHint = el('p', { class: 'bdl-hint' });
  const dialog = el('dialog', { class: 'bdl-dialog', 'aria-labelledby': 'keycap-icon-title' },
    el('div', { class: 'bdl-dialog-header' }, el('h2', { id: 'keycap-icon-title' }, 'Scegli un’icona'), button({ label: 'Chiudi', onClick: () => dialog.close() })),
    el('p', { class: 'bdl-hint' }, 'L’icona verrà applicata al tasto selezionato.'), search, iconGrid, empty);
  document.body.append(dialog);
  function renderIcons() {
    const query = search.value.trim().toLocaleLowerCase('it');
    const matches = KEY_ICONS.filter(([id, name, tags]) => `${id} ${name} ${tags}`.toLocaleLowerCase('it').includes(query));
    iconGrid.replaceChildren(...matches.map(([id, name, , path]) => {
      const token = `@icon:${id}`;
      const b = button({ label: '', onClick: () => { const labels = readKeyLabels(get().keyLabels); labels[active] = token; update(JSON.stringify(labels)); dialog.close(); } });
      b.innerHTML = keyIconSvg(path); b.append(el('span', {}, name));
      b.title = name; b.setAttribute('aria-label', name); b.setAttribute('aria-pressed', String(readKeyLabels(get().keyLabels)[active] === token));
      return b;
    }));
    empty.hidden = matches.length !== 0;
  }
  search.addEventListener('input', renderIcons);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  const chooseIcon = button({ label: 'Scegli un’icona', onClick: () => { search.value = ''; renderIcons(); dialog.showModal(); search.focus(); } });
  const root = section('Tasti con testo',
    el('p', { class: 'bdl-hint' }, 'Ogni carattere crea un tasto con il proprio switch. Da 1 a 8 tasti; seleziona un tasto per personalizzarne il contenuto. Gli spazi creano tasti vuoti.'),
    el('div', { class: 'bdl-form-field' }, el('label', { for: 'keycap-phrase' }, 'Parola iniziale'), phrase),
    button({ label: 'Crea tasti dalla parola', variant: 'primary', onClick: () => { const labels = Array.from(phrase.value); if (!labels.length || labels.length > 8) { toast('Scrivi da 1 a 8 caratteri'); return; } active = 0; update(JSON.stringify(labels)); } }),
    direction.root, list,
    el('div', { class: 'bdl-form-field' }, el('label', { for: 'keycap-key-label' }, 'Contenuto del tasto selezionato'), content),
    button({ label: 'Applica al tasto', onClick: change }),
    el('div', { class: 'bdl-form-field' }, chooseIcon, iconHint),
    el('div', { class: 'bdl-actions' }, button({ label: 'Aggiungi tasto', onClick: () => { const labels = readKeyLabels(get().keyLabels); if (labels.length >= 8) { toast('Massimo 8 tasti'); return; } labels.push(''); active = labels.length - 1; update(JSON.stringify(labels)); } }), remove),
    el('p', { class: 'bdl-hint' }, 'La tecnica e il colore del testo si scelgono in Disegno. Il numero di switch segue il numero dei tasti.'),
  );
  function sync() {
    const labels = readKeyLabels(get().keyLabels); active = Math.min(active, labels.length - 1);
    list.replaceChildren(...labels.map((label, i) => { const b = button({ label: `${i + 1} · ${keyLabelName(label) || 'vuoto'}`, size: 'sm', onClick: () => { active = i; sync(); } }); b.setAttribute('aria-pressed', String(i === active)); return b; }));
    const icon = findKeyIcon(labels[active]);
    iconHint.textContent = icon ? `Icona attuale: ${icon[1]}. Scrivi un testo per sostituirla.` : 'Sfoglia le icone o cercale per nome.';
    content.value = icon ? '' : labels[active]; direction.set(get().keyLayout); remove.disabled = labels.length === 1;
  }
  function select(index: number) { active = index; sync(); }
  sync(); return { root, sync, select };
}
