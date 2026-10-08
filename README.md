# Cross

A cryptic crossword editor: design blocked or barred grids, fill them by hand,
and write clues with enumerations. Built on SolidJS 2.0 (RC) + Vite; data is
kept in localStorage (export/import JSON from the library for backups).

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # model + storage unit tests
npm run build      # typecheck + production build
```

## Layout

- `src/model/` – pure TS, no Solid: numbering (`lights.ts`), symmetry,
  enumerations, navigation, grid stats, puzzle factory. Unit tested.
- `src/state/` – Solid state: `library.ts` (global puzzle index),
  `editor.ts` (one open puzzle: store, memos, undo/redo, autosave),
  `storage.ts` (localStorage + schema migration), `route.ts` (hash routing).
- `src/components/` – UI. `GridView` is an SVG grid with a hidden input for
  keyboard capture. `tools/` is the helper dock under the clue list (Words,
  Anagrams, Regex); add a helper by writing a component that takes
  `ToolProps` and listing it in `tools/registry.ts`.
- `src/words/` – the word index (`word-index.ts`: per-length bitsets for each
  position × letter, so pattern matches are ANDs and counts are popcounts),
  suggestion ranking, anagram and regex search, and the Web Worker that hosts
  them. The client restarts the worker if a request runs too long (e.g. a
  catastrophically backtracking regex).
- `public/wordlists/` – dictionaries, pure ASCII. After changing them, run
  `node scripts/clean-wordlists.ts` to fold diacritics (é→E, ø→O) and dedupe.
  All matching is on uppercase A–Z; user input goes through `toLetters()`.
- `old-code/` – the previous implementation, kept for reference.

## Notes on Solid 2

- Every puzzle edit goes through `commit()` in `editor.ts`, which records undo
  history and schedules the save. Don't call `setPuzzle` elsewhere.
- `snapshot(store)` returns the store's raw backing object, not a copy. Clone it
  (`structuredClone`) before keeping it around — e.g. for undo history.
- Grid structure is read once by the `shape` memo; lights and stats derive
  from that plain data, which keeps dependency fan-in small.
