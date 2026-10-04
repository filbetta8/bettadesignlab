import { section, el, slider, segmented, button, toast } from '@bdl/ui-kit';
import { readBlocks, type Block } from './blocks.ts';

export function createBlockEditor(get: () => string, set: (value: string) => void) {
  let active = 0;
  const names = { square: 'Rettangolo', round: 'Ellisse', hex: 'Esagono' };
  const list = el('div', { class: 'bdl-row', role: 'group', 'aria-label': 'Blocchi della forma' });
  const edit = (key: keyof Block, value: string | number) => {
    const blocks = readBlocks(get()); blocks[active] = { ...blocks[active], [key]: value } as Block;
    set(JSON.stringify(blocks)); sync();
  };
  const shape = segmented<Block['shape']>({ label: 'Forma del blocco', value: 'square', options: [
    { value: 'square', label: 'Rettangolo' }, { value: 'round', label: 'Ellisse' }, { value: 'hex', label: 'Esagono' },
  ], onChange: (v) => edit('shape', v) });
  const rows = (['width', 'height', 'x', 'y', 'angle'] as const).map((key) => {
    const labels = { width: 'Larghezza blocco', height: 'Altezza blocco', x: 'Posizione X blocco', y: 'Posizione Y blocco', angle: 'Rotazione blocco' };
    const row = slider({ label: labels[key], value: readBlocks(get())[0][key], min: key === 'angle' ? -180 : key === 'x' || key === 'y' ? -60 : 8,
      max: key === 'angle' ? 180 : key === 'x' || key === 'y' ? 60 : 80, unit: key === 'angle' ? '°' : 'mm', onInput: (v) => edit(key, v) });
    return { key, row };
  });
  const remove = button({ label: 'Elimina blocco', onClick: () => {
    const blocks = readBlocks(get()); if (blocks.length === 1) return;
    blocks.splice(active, 1); active = Math.min(active, blocks.length - 1); set(JSON.stringify(blocks)); sync();
  } });
  const add = (shape?: Block['shape']) => {
    const blocks = readBlocks(get()); if (blocks.length >= 12) { toast('Massimo 12 blocchi'); return; }
    const source = blocks[active];
    blocks.push({ ...source, shape: shape ?? source.shape, x: Math.min(60, source.x + Math.min(8, source.width / 4)) });
    active = blocks.length - 1; set(JSON.stringify(blocks)); sync();
  };
  const root = section('Componi a blocchi',
    el('p', { class: 'bdl-hint' }, 'Aggiungi forme e sovrapponile per costruire un corpo unico. Le misure sono in millimetri. Seleziona un blocco nell’elenco per modificarlo.'),
    button({ label: '+ Rettangolo', onClick: () => add('square') }),
    button({ label: '+ Ellisse', onClick: () => add('round') }),
    button({ label: '+ Esagono', onClick: () => add('hex') }),
    list, shape.root, ...rows.map(({ row }) => row.root),
    button({ label: 'Duplica blocco', onClick: () => add() }), remove,
  );
  function sync() {
    const blocks = readBlocks(get()); active = Math.min(active, blocks.length - 1);
    list.replaceChildren(...blocks.map((block, i) => {
      const b = button({ label: `${i + 1} · ${names[block.shape]}`, size: 'sm', onClick: () => { active = i; sync(); } });
      b.setAttribute('aria-pressed', String(i === active)); return b;
    }));
    shape.set(blocks[active].shape); rows.forEach(({ key, row }) => row.set(blocks[active][key]));
    remove.disabled = blocks.length === 1;
  }
  sync(); return { root, sync };
}
