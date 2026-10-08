import { toLetters } from '../model/ascii';
import { normalizeBlocked, pruneClues } from '../model/puzzle';
import { type Cell, type Puzzle, SCHEMA_VERSION, emptyCell } from '../model/types';

/**
 * localStorage persistence. the index holds lightweight summaries so the
 * library can render without parsing every puzzle; each puzzle is stored
 * under its own key. every access is guarded: storage can be missing,
 * full, or blocked.
 */

export interface PuzzleSummary {
  id: string;
  title: string;
  rows: number;
  cols: number;
  style: Puzzle['style'];
  updated: number;
  /** compact grid for thumbnails: '#' block, '.' white; bars not shown */
  thumb: string;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const INDEX_KEY = 'cross:index';
const puzzleKey = (id: string) => `cross:puzzle:${id}`;

const defaultStorage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const summarize = (p: Puzzle): PuzzleSummary => ({
  id: p.id,
  title: p.title,
  rows: p.rows,
  cols: p.cols,
  style: p.style,
  updated: p.updated,
  thumb: p.cells.map(c => (c.block ? '#' : '.')).join(''),
});

/**
 * bring stored data up to the current schema. there is only v1 so far;
 * this also repairs missing fields so a hand-edited file can't crash us.
 */
export const migrate = (raw: unknown): Puzzle | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Partial<Puzzle> & { schema?: number };
  if (src.schema !== undefined && src.schema > SCHEMA_VERSION) return undefined;
  const rows = Number(src.rows);
  const cols = Number(src.cols);
  if (!(rows > 0 && cols > 0) || typeof src.id !== 'string') return undefined;
  const cells: Cell[] = [];
  for (let i = 0; i < rows * cols; i++) {
    const c: Partial<Cell> = (Array.isArray(src.cells) && src.cells[i]) || {};
    const letter = typeof c.letter === 'string' ? toLetters(c.letter).slice(0, 1) : '';
    cells.push({ ...emptyCell(), block: !!c.block, barRight: !!c.barRight, barBottom: !!c.barBottom, letter, auto: !!letter && !!c.auto });
  }
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    id: src.id,
    title: typeof src.title === 'string' ? src.title : 'Untitled',
    setter: typeof src.setter === 'string' ? src.setter : '',
    created: Number(src.created) || now,
    updated: Number(src.updated) || now,
    rows, cols,
    style: src.style === 'barred' ? 'barred' : 'blocked',
    symmetry: src.symmetry === 'none' ? 'none' : 'rotational',
    cells,
    clues: src.clues && typeof src.clues === 'object' ? { ...src.clues } : {},
    blocked: Array.isArray(src.blocked) ? normalizeBlocked(src.blocked.filter(w => typeof w === 'string')) : [],
  };
};

/** the stored form: orphaned and empty clues are dropped */
export const serialize = (p: Puzzle) => JSON.stringify({ ...p, clues: pruneClues(p) });

export const createStorage = (storage: StorageLike | undefined = defaultStorage()) => {
  const read = (key: string): unknown => {
    try {
      const text = storage?.getItem(key);
      return text ? JSON.parse(text) : undefined;
    } catch {
      return undefined;
    }
  };

  const write = (key: string, value: string) => {
    try {
      storage?.setItem(key, value);
      return true;
    } catch (err) {
      console.error('storage write failed', err);
      return false;
    }
  };

  const loadIndex = (): PuzzleSummary[] => {
    const list = read(INDEX_KEY);
    return Array.isArray(list) ? list.filter(s => s && typeof s.id === 'string') : [];
  };

  const saveIndex = (list: PuzzleSummary[]) => write(INDEX_KEY, JSON.stringify(list));

  const loadPuzzle = (id: string) => migrate(read(puzzleKey(id)));

  const savePuzzle = (p: Puzzle) => write(puzzleKey(p.id), serialize(p));

  const removePuzzle = (id: string) => {
    try {
      storage?.removeItem(puzzleKey(id));
    } catch {
      // ignore
    }
  };

  return { loadIndex, saveIndex, loadPuzzle, savePuzzle, removePuzzle };
};

export type PuzzleStorage = ReturnType<typeof createStorage>;
