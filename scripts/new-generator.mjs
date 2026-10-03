#!/usr/bin/env node
/*
  pnpm new:generator <id> "Nome visibile" "Descrizione di una riga" [Categoria]

  Copia apps/_template in apps/<id>, sostituisce nome e descrizione e aggiunge la voce
  in generators.json con status "beta" (visibile nell'hub e incluso nella build).
  Dopo: riscrivere src/geometry.ts e src/params.ts del nuovo generatore.
*/
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const [id, name, blurb = '', category = 'Casa'] = process.argv.slice(2);

if (!id || !name || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
  console.error('Uso: pnpm new:generator <id-minuscolo> "Nome" "Descrizione" [Categoria]');
  process.exit(1);
}
const dest = join(ROOT, 'apps', id);
if (existsSync(dest)) { console.error(`apps/${id} esiste già`); process.exit(1); }

cpSync(join(ROOT, 'apps', '_template'), dest, { recursive: true });

const replaceIn = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { replaceIn(p); continue; }
    const text = readFileSync(p, 'utf8');
    writeFileSync(p, text.replaceAll('__NAME__', name).replaceAll('__BLURB__', blurb));
  }
};
replaceIn(dest);

const regPath = join(ROOT, 'generators.json');
const reg = JSON.parse(readFileSync(regPath, 'utf8'));
const existing = reg.generators.find((g) => g.id === id);
if (existing) existing.status = 'beta';
else reg.generators.push({ id, name, status: 'beta', category, blurb });
writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');

console.log(`Creato apps/${id}. Avvia "pnpm dev" e apri http://localhost:5173/${id}/`);
