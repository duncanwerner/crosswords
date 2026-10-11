import { toLetters } from '../model/ascii';
import { type ClueRecord, toRecord } from '../model/clue-log';
import { type PlayProgress, parseProgress } from '../model/play';
import { isComplete, normalizeBlocked, pruneClues } from '../model/puzzle';
import { type Cell, type ClueEntry, type ClueStatus, type LightKey, type Puzzle, CLUE_STATUSES, SCHEMA_VERSION, emptyCell } from '../model/types';

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
  revision: number;
  /** compact grid for thumbnails: '#' block, '.' white, 'r'/'b'/'+' bar right/bottom/both */
  thumb: string;
  /** every square filled and every answer clued */
  complete: boolean;
  template: boolean;
  /** summaries from an older version are rebuilt from their puzzle */
  v: typeof SUMMARY_VERSION;
}

export const SUMMARY_VERSION = 3;

const thumbCell = (c: Cell) => (c.block ? '#' : c.barRight && c.barBottom ? '+' : c.barRight ? 'r' : c.barBottom ? 'b' : '.');

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const INDEX_KEY = 'cross:index';
const puzzleKey = (id: string) => `cross:puzzle:${id}`;
const progressKey = (id: string) => `cross:play:${id}`;

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
  revision: p.revision,
  thumb: p.cells.map(thumbCell).join(''),
  complete: isComplete(p),
  template: !!p.template,
  v: SUMMARY_VERSION,
});

const KEY = /^\d+,\d+,[AD]$/;

/** clue entries with the right field types; anything else is dropped */
const migrateClues = (raw: unknown): Puzzle['clues'] => {
  const clues: Puzzle['clues'] = {};
  if (!raw || typeof raw !== 'object') return clues;
  for (const [key, value] of Object.entries(raw)) {
    if (!KEY.test(key) || !value || typeof value !== 'object') continue;
    const v = value as Partial<ClueEntry>;
    const entry: ClueEntry = {
      text: typeof v.text === 'string' ? v.text : '',
      enumeration: typeof v.enumeration === 'string' ? v.enumeration : '',
    };
    const links = Array.isArray(v.links) ? v.links.filter(k => typeof k === 'string' && KEY.test(k)) : [];
    if (links.length) entry.links = links;
    if (typeof v.explanation === 'string' && v.explanation.trim()) entry.explanation = v.explanation;
    if (CLUE_STATUSES.includes(v.status as ClueStatus)) entry.status = v.status;
    clues[key as LightKey] = entry;
  }
  return clues;
};

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
    revision: Number.isSafeInteger(src.revision) && src.revision! > 0 ? src.revision! : 0,
    rows, cols,
    style: src.style === 'barred' ? 'barred' : 'blocked',
    symmetry: src.symmetry === 'none' ? 'none' : 'rotational',
    cells,
    clues: migrateClues(src.clues),
    blocked: Array.isArray(src.blocked) ? normalizeBlocked(src.blocked.filter(w => typeof w === 'string')) : [],
    required: Array.isArray(src.required) ? normalizeBlocked(src.required.filter(w => typeof w === 'string')) : [],
    ...(src.template === true ? { template: true } : {}),
  };
};

/** the stored form: orphaned and empty clues are dropped */
const stored = (p: Puzzle) => ({ ...p, clues: pruneClues(p) });

export const serialize = (p: Puzzle) => JSON.stringify(stored(p));

const BACKUP_KIND = 'cross-library';

/** v1: puzzles only. v2: adds the clue log. */
export const BACKUP_VERSION = 2;

/**
 * everything the app keeps, as one document: the library backup file now,
 * and the unit a future back-end would store. play progress isn't included.
 */
export interface Backup {
  puzzles: Puzzle[];
  clues: ClueRecord[];
}

export const serializeLibrary = ({ puzzles, clues }: Backup, exported = Date.now()) =>
  JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, exported, puzzles: puzzles.map(stored), clueLog: clues });

/**
 * the contents of a library backup, or undefined if `raw` isn't one.
 * entries that can't be read are counted; a backup from a newer version throws.
 */
export const parseBackup = (raw: unknown): (Backup & { unreadable: number }) | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as { kind?: unknown; version?: unknown; puzzles?: unknown; clueLog?: unknown };
  if (src.kind !== BACKUP_KIND || !Array.isArray(src.puzzles)) return undefined;
  if (Number(src.version) > BACKUP_VERSION) throw new Error('That backup was made by a newer version of Cross; reload the app to update it.');
  const rawClues = Array.isArray(src.clueLog) ? src.clueLog : [];
  const puzzles = src.puzzles.map(migrate).filter(p => p !== undefined);
  const clues = rawClues.map(toRecord).filter(r => r !== undefined);
  return { puzzles, clues, unreadable: src.puzzles.length - puzzles.length + rawClues.length - clues.length };
};

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

  /** removes the puzzle and any play progress on it */
  const removePuzzle = (id: string) => {
    try {
      storage?.removeItem(puzzleKey(id));
      storage?.removeItem(progressKey(id));
    } catch {
      // ignore
    }
  };

  const loadProgress = (id: string) => parseProgress(read(progressKey(id)));

  const saveProgress = (id: string, progress: PlayProgress) => write(progressKey(id), JSON.stringify(progress));

  return { loadIndex, saveIndex, loadPuzzle, savePuzzle, removePuzzle, loadProgress, saveProgress };
};

export type PuzzleStorage = ReturnType<typeof createStorage>;
