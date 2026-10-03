# Betta Design Lab

Generatori parametrici per stampa 3D che girano interamente nel browser: l'utente
sceglie i parametri, vede l'anteprima 3D e scarica STL o 3MF multicolore.
Nessun server, nessun account, nessun costo per chi usa il sito.

## Avvio in locale (Windows)

Serve [Node.js 22 LTS](https://nodejs.org). Poi, da PowerShell nella cartella del progetto:

```powershell
corepack enable          # attiva pnpm (una volta sola)
pnpm install             # scarica le librerie (una volta, o quando cambiano)
pnpm dev                 # apre il sito su http://localhost:5173
```

Se `corepack enable` dà errore di permessi: `npm install -g pnpm`.

## Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | sito di sviluppo con ricarica automatica |
| `pnpm build` | build di produzione in `dist/` |
| `pnpm preview` | serve `dist/` per una prova finale |
| `pnpm test` | prova ogni combinazione di parametri dei generatori |
| `pnpm typecheck` | controllo dei tipi TypeScript |
| `pnpm new:generator <id> "Nome" "Descrizione" [Categoria]` | crea un nuovo generatore dal template |

## Struttura

```
apps/
  index.html, hub/      catalogo (card generate da generators.json)
  coaster/              generatore sottobicchieri
  _template/            generatore minimo da cui partono i nuovi
packages/
  brand/                nome, link, licenza, palette filamenti (unica fonte)
  ui-kit/               stile e controlli condivisi
  viewer/               anteprima 3D (three.js)
  geometry/             manifold-3d: caricamento WASM, memoria, profili 2D
  export/               STL binario, 3MF multi-oggetto, download
scripts/                test geometria, scaffolding
generators.json         registro di tutti i generatori
```

Librerie: [three.js](https://threejs.org) (MIT), [manifold-3d](https://github.com/elalish/manifold) (Apache-2.0),
[fflate](https://github.com/101arrowz/fflate) (MIT), [Vite](https://vite.dev) (MIT).

## Pubblicazione

Quando c'è una repo GitHub: push su `main` → la action `.github/workflows/deploy.yml` esegue
typecheck, test e build e pubblica `dist/` su GitHub Pages (Settings → Pages → Source: GitHub Actions).
