# Cross: working notes

Cryptic crossword editor (Guardian/Azed style; **cryptic only**, no
NYT-style conventions). SolidJS 2.0 RC + Vite + TypeScript, with no back-end.
The README covers the features and code layout.

## Commands

- `npm run dev`: dev server
- `npm test`: Vitest unit tests (pure model, words, storage)
- `npm run build`: `tsc --noEmit` plus the production build. Run it before
  committing.
- `node scripts/clean-wordlists.ts`: re-clean `public/wordlists/` after
  editing them

## Conventions

- **Solid 2, not 1.x.** Read `node_modules/solid-js/CHEATSHEET.md` before
  writing Solid code. The rules that bite most often here:
  - `createEffect(compute, apply)` takes two arguments.
  - Never write state in a component body or memo. Load or kick off work in
    `onSettled` or an event handler.
  - Props are values; don't destructure them.
  - `JSX` types come from `@solidjs/web`.
  - `aria-*` booleans must be the strings `'true'`/`'false'`.
- **`snapshot()` aliases the store's raw data.** Clone it with
  `structuredClone` before keeping it around.
- **Puzzle edits go through `commit()`** in `src/state/editor.ts`. It records
  undo history, schedules the autosave, and bumps `gridVersion`; pass
  `touchesGrid = false` for edits that don't change cells. Don't call
  `setPuzzle` elsewhere.
- **ASCII only.** Grid letters and dictionary matching are uppercase A–Z.
  Every input path (typing, answers, imports, word lists) goes through
  `toAscii`/`toLetters` in `src/model/ascii.ts`.
- **Helpers live in the tools dock**, under the clue list, and must stay
  visible while a clue is being edited. Never use tabs that replace the clue
  panel, or modals. Typing in a helper must not change the grid selection.
  Add a helper as a component taking `ToolProps`, registered in
  `src/components/tools/registry.ts`.
- **Word work runs in the worker** (`src/words/worker.ts`) through
  `src/words/client.ts`.
  - Every query carries the puzzle's block list.
  - Long operations run in slices and report progress.
  - A request that times out gets the worker restarted.
- **Model code stays framework-free.** `src/model/` and `src/words/` have no
  Solid imports and are unit tested.
- **Avoid huge reactive fan-in.** Dev mode warns at about 2,000 sources. Derive
  from the `shape` memo, or use `gridVersion`, rather than reading every cell
  in a new memo.

## Verifying UI changes

There's no component test setup yet. Drive the app with Playwright against
`npm run dev`, using Chrome at `/usr/bin/google-chrome`, and check the console
for Solid diagnostics such as `STRICT_READ_UNTRACKED`, `HUGE_FAN_IN` and
`REACTIVE_WRITE_IN_OWNED_SCOPE`.

## Git

The user works on `main` and reviews changes before asking for a commit. The
remote is `origin` (`git@github.com:duncanwerner/crosswords.git`, over SSH).
