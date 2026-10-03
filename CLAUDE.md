# bettadesignlab — regole per Claude

- Modello: `.claude/settings.json` usa `opusplan` (Opus in plan mode, modello di default in esecuzione).
  Per lavori nuovi o grandi: pianifica prima in plan mode, poi esegui.
- Tutto gira nel browser. Nessun backend, nessuna chiamata ad API AI dal sito.
- Codice scritto da zero: non copiare codice da altri progetti senza licenza compatibile.
- Testi dell'interfaccia in italiano.

## Invarianti

1. Ogni generatore è registrato in `generators.json`; la build crea una pagina per ogni voce non `planned`.
2. Link, nome, licenza e palette filamenti solo da `@bdl/brand`.
3. Ogni controllo UI viene da `@bdl/ui-kit`; se serve uno stile nuovo, si aggiunge lì, non nell'app.
4. La geometria di un generatore è una funzione pura `(manifold, params) → { parts, warnings }` in
   `src/geometry.ts`, senza DOM, testata in `scripts/test-geometry.ts`.
5. Ogni oggetto manifold creato passa da `Scope.t()` e viene liberato con `free()`.
6. I parametri passano sempre da `sanitize()` (arrivano anche da link condivisi).
7. I pezzi poggiano sul piatto (z min = 0) e sono solidi chiusi.

## Nuovo generatore

`pnpm new:generator <id> "Nome" "Descrizione" [Categoria]`, poi riscrivi `params.ts` e `geometry.ts`,
aggiungi i casi a `scripts/test-geometry.ts`, verifica con `pnpm typecheck && pnpm test && pnpm build`.
