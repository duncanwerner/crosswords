import { toLetters } from './ascii';
import { computeLights } from './lights';
import { type LinkMap, computeEntries } from './links';
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
    revision: 1,
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

/**
 * a new puzzle from a template: the grid's blocks and bars, size, style
 * and symmetry. letters, clues and word lists are left behind.
 */
export const fromTemplate = (t: Puzzle, title = ''): Puzzle => {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: newId(),
    title: title || 'Untitled',
    setter: t.setter,
    created: now,
    updated: now,
    revision: 1,
    rows: t.rows,
    cols: t.cols,
    style: t.style,
    symmetry: t.symmetry,
    cells: t.cells.map(c => ({ ...emptyCell(), block: c.block, barRight: c.barRight, barBottom: c.barBottom })),
    clues: {},
    blocked: [],
    required: [],
  };
};

/** drop clues whose light no longer exists (or which are empty), and links to missing lights */
export const pruneClues = (puzzle: Pick<Puzzle, 'rows' | 'cols' | 'cells' | 'clues'>) => {
  const keys = new Set(computeLights(puzzle).lights.map(l => l.key));
  const clues: Partial<Record<LightKey, ClueEntry>> = {};
  for (const [key, entry] of Object.entries(puzzle.clues) as Array<[LightKey, ClueEntry | undefined]>) {
    if (!entry || !keys.has(key)) continue;
    const links = entry.links?.filter(k => keys.has(k) && k !== key);
    const { links: _, explanation, ...rest } = entry;
    const next: ClueEntry = links?.length ? { ...rest, links } : rest;
    if (explanation?.trim()) next.explanation = explanation;
    if (next.text || next.enumeration || next.links || next.explanation) clues[key] = next;
  }
  return clues;
};

/** normalize a word list (blocked or required): uppercase A-Z, no empties, unique, sorted */
export const normalizeBlocked = (words: readonly string[]) =>
  [...new Set(words.map(toLetters).filter(Boolean))].sort();

/** split typed text ("els, ens nit") into words */
export const parseWordList = (text: string) => normalizeBlocked(text.split(/[\s,;]+/));

/**
 * finished: every white square has a letter and every answer has a clue.
 * explanations are optional and don't count.
 */
export const isComplete = (puzzle: Pick<Puzzle, 'rows' | 'cols' | 'cells' | 'clues'>) => {
  if (puzzle.cells.some(c => !c.block && !c.letter)) return false;
  const map = computeLights(puzzle);
  if (!map.lights.length) return false;
  const links: LinkMap = {};
  for (const light of map.lights) {
    const keys = puzzle.clues[light.key]?.links;
    if (keys?.length) links[light.key] = keys;
  }
  return computeEntries(map, links).list.every(e => puzzle.clues[e.key]?.text.trim());
};
