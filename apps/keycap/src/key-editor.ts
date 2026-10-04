import { el, section, button, segmented, toast } from '@bdl/ui-kit';
import { readKeyLabels, type Params } from './params.ts';

export function createKeyEditor(get: () => Params, update: (labels: string) => void, layout: (value: Params['keyLayout']) => void) {
  let active = 0;
  const phrase = el('input', { type: 'text', id: 'keycap-phrase', placeholder: 'FILI', maxlength: '32' });
  const content = el('input', { type: 'text', id: 'keycap-key-label', maxlength: '24', placeholder: 'Lettera, testo o simbolo' });
  const list = el('div', { class: 'bdl-row', role: 'group', 'aria-label': 'Tasti con testo' });
  const direction = segmented<Params['keyLayout']>({ label: 'Disposizione tasti', value: get().keyLayout, options: [{ value: 'horizontal', label: 'Orizzontale' }, { value: 'vertical', label: 'Verticale' }], onChange: layout });
  const change = () => { const labels = readKeyLabels(get().keyLabels); labels[active] = content.value; update(JSON.stringify(labels)); };
  content.addEventListener('change', change);
  const remove = button({ label: 'Elimina tasto', onClick: () => { const labels = readKeyLabels(get().keyLabels); if (labels.length === 1) return; labels.splice(active, 1); active = Math.min(active, labels.length - 1); update(JSON.stringify(labels)); } });
  const root = section('Tasti con testo',
    el('p', { class: 'bdl-hint' }, 'Ogni carattere crea un tasto con il proprio switch. Da 1 a 8 tasti; seleziona un tasto per personalizzarne il contenuto. Gli spazi creano tasti vuoti.'),
    el('label', { for: 'keycap-phrase' }, 'Parola iniziale'), phrase,
    button({ label: 'Crea tasti dalla parola', onClick: () => { const labels = Array.from(phrase.value); if (!labels.length || labels.length > 8) { toast('Scrivi da 1 a 8 caratteri'); return; } active = 0; update(JSON.stringify(labels)); } }),
    direction.root, list,
    el('label', { for: 'keycap-key-label' }, 'Contenuto del tasto selezionato'), content,
    button({ label: 'Applica al tasto', onClick: change }),
    button({ label: 'Aggiungi tasto', onClick: () => { const labels = readKeyLabels(get().keyLabels); if (labels.length >= 8) { toast('Massimo 8 tasti'); return; } labels.push(''); active = labels.length - 1; update(JSON.stringify(labels)); } }), remove,
    el('p', { class: 'bdl-hint' }, 'La tecnica e il colore del testo si scelgono in Disegno. Il numero di switch segue il numero dei tasti.'),
  );
  function sync() {
    const labels = readKeyLabels(get().keyLabels); active = Math.min(active, labels.length - 1);
    list.replaceChildren(...labels.map((label, i) => { const b = button({ label: `${i + 1} · ${label || 'vuoto'}`, size: 'sm', onClick: () => { active = i; sync(); } }); b.setAttribute('aria-pressed', String(i === active)); return b; }));
    content.value = labels[active]; direction.set(get().keyLayout); remove.disabled = labels.length === 1;
  }
  function select(index: number) { active = index; sync(); }
  sync(); return { root, sync, select };
}
