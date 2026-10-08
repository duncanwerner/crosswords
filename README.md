# Cross

A cryptic crossword editor: design blocked or barred grids, fill them by hand
or automatically, and write clues with enumerations. Built on SolidJS 2.0 (RC)
+ Vite; data is kept in localStorage (export/import JSON from the library for
backups).

## Features

- **Grid design**: blocked or barred grids up to 25×25, with optional 180°
  symmetry. Numbering is live, and there are grid stats and warnings
  (unchecked runs, disconnected areas, asymmetry).
- **Fill and clues**: keyboard fill, clues keyed to their lights (they
  survive renumbering), and enumerations like `(3,4)` or `(4-5)` drawn in the
  grid. Typing an answer like "man-of-war" fills the light and sets the
  enumeration.
- **Tools dock** under the clue list, so a helper's results stay visible
  while you write a clue:
  - Words: fill suggestions ranked by how they leave the crossings
  - Anagrams: one- and multi-word
  - Regex: dictionary search
  - Auto-fill: preview, then apply; your own letters are kept
  - Blocked: a per-puzzle list of words never to offer
- Undo/redo for every edit; resizable panels; light and dark themes.

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
  Anagrams, Regex, Auto-fill, Blocked); add a helper by writing a component
  that takes `ToolProps` and listing it in `tools/registry.ts`.
- `src/words/` – the word index (`word-index.ts`: per-length bitsets for each
  position × letter, so pattern matches are ANDs and counts are popcounts),
  suggestion ranking, anagram and regex search, and the Web Worker that hosts
  them. The client restarts the worker if a request runs too long (e.g. a
  catastrophically backtracking regex). Each query carries the puzzle's
  block list, which the index applies to its allowed set, so blocked words
  vanish from every helper (and from crossing counts) without per-tool code.
- `src/words/fill.ts` – the auto-fill: most-constrained light first,
  candidates ordered by crossing options (dead ends pruned), no repeats,
  Luby restarts. A step machine, so the worker runs it in slices and can
  report progress and honour cancel. Cells carry an `auto` flag so re-fills
  replace only auto-fill letters.
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
