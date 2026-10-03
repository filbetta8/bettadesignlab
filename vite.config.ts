import { defineConfig } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Una sola build per tutto il sito: l'hub (apps/index.html) + una pagina per ogni
// generatore pubblicato in generators.json. Aggiungere un generatore = aggiungere
// la sua voce al registro, nient'altro.
const root = resolve(import.meta.dirname, 'apps');
const registry = JSON.parse(readFileSync(resolve(import.meta.dirname, 'generators.json'), 'utf8'));
const input: Record<string, string> = { hub: resolve(root, 'index.html') };
for (const g of registry.generators) {
  if (g.status === 'planned') continue;
  const page = resolve(root, g.id, 'index.html');
  if (!existsSync(page)) throw new Error(`generators.json: manca apps/${g.id}/index.html`);
  input[g.id] = page;
}

export default defineConfig({
  root,
  base: './',
  publicDir: resolve(import.meta.dirname, 'public'),
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    // three.js da solo supera i 500 kB: è atteso.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: { input },
  },
  optimizeDeps: { exclude: ['manifold-3d'] },
  server: { open: true },
});
