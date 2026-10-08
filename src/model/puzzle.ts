import { toLetters } from './ascii';
import { computeLights } from './lights';
import { type Cell, type ClueEntry, type GridStyle, type LightKey, type Puzzle, type Symmetry, SCHEMA_VERSION, emptyCell } from './types';

export type Template = 'empty' | 'lattice';

export interface NewPuzzleOptions {
  rows: number;
  cols: number;
  style: GridStyle;
  symmetry: Symmetry;
  template: Template;
  title?: string;
}

export const MIN_SIZE = 3;
export const MAX_SIZE = 25;

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export const createPuzzle = (options: NewPuzzleOptions): Puzzle => {
  const rows = clampSize(options.rows);
  const cols = clampSize(options.cols);
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = emptyCell();
      // lattice: blocks at every (odd, odd) cell
      if (options.template === 'lattice' && options.style === 'blocked' && r % 2 === 1 && c % 2 === 1) {
        cell.block = true;
      }
      cells.push(cell);
    }
  }
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: newId(),
    title: options.title || 'Untitled',
    setter: '',
    created: now,
    updated: now,
    rows, cols,
    style: options.style,
    symmetry: options.symmetry,
    cells,
    clues: {},
    blocked: [],
    required: [],
  };
};

export const clampSize = (n: number) =>
  Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(Number.isFinite(n) ? n : 15)));

/** drop clues whose light no longer exists (or which are empty), and links to missing lights */
export const pruneClues = (puzzle: Pick<Puzzle, 'rows' | 'cols' | 'cells' | 'clues'>) => {
  const keys = new Set(computeLights(puzzle).lights.map(l => l.key));
  const clues: Partial<Record<LightKey, ClueEntry>> = {};
  for (const [key, entry] of Object.entries(puzzle.clues) as Array<[LightKey, ClueEntry | undefined]>) {
    if (!entry || !keys.has(key)) continue;
    const links = entry.links?.filter(k => keys.has(k) && k !== key);
    const { links: _, ...rest } = entry;
    const next: ClueEntry = links?.length ? { ...rest, links } : rest;
    if (next.text || next.enumeration || next.links) clues[key] = next;
  }
  return clues;
};

/** normalize a word list (blocked or required): uppercase A-Z, no empties, unique, sorted */
export const normalizeBlocked = (words: readonly string[]) =>
  [...new Set(words.map(toLetters).filter(Boolean))].sort();

/** split typed text ("els, ens nit") into words */
export const parseWordList = (text: string) => normalizeBlocked(text.split(/[\s,;]+/));
