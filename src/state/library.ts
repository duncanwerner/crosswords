import { createStore, snapshot } from 'solid-js';
import { type NewPuzzleOptions, createPuzzle, fromTemplate, newId } from '../model/puzzle';
import type { ClueRecord } from '../model/clue-log';
import { type PlayProgress } from '../model/play';
import type { Puzzle } from '../model/types';
import { allClues, mergeClues } from './clue-log';
import { type PuzzleSummary, SUMMARY_VERSION, createStorage, migrate, parseBackup, serialize, serializeLibrary, summarize } from './storage';

/**
 * the puzzle library: a module-level (i.e. global) store of summaries,
 * mirrored to localStorage. full puzzles are loaded on demand.
 */

export const storage = createStorage();

/** summaries saved by an older version are rebuilt from their puzzle */
const loadIndex = () => {
  let stale = false;
  const list = storage.loadIndex().map(s => {
    if (s.v === SUMMARY_VERSION) return s;
    const p = storage.loadPuzzle(s.id);
    if (!p) return s;
    stale = true;
    return summarize(p);
  });
  if (stale) storage.saveIndex(list);
  return list;
};

const [library, setLibrary] = createStore({ puzzles: loadIndex() });

export { library };

const byUpdated = (a: PuzzleSummary, b: PuzzleSummary) => b.updated - a.updated;

/**
 * reads through the store can lag writes until flush, so compute the new
 * list from a snapshot, persist it, then write it back.
 */
const updateIndex = (fn: (list: PuzzleSummary[]) => PuzzleSummary[]) => {
  const next = [...fn([...snapshot(library.puzzles)] as PuzzleSummary[])].sort(byUpdated);
  storage.saveIndex(next);
  setLibrary(s => {
    s.puzzles = next;
  });
};

const add = (p: Puzzle) => {
  storage.savePuzzle(p);
  updateIndex(list => [summarize(p), ...list.filter(s => s.id !== p.id)]);
  return p;
};

export const createNewPuzzle = (options: NewPuzzleOptions) => add(createPuzzle(options));

export const loadPuzzle = (id: string) => storage.loadPuzzle(id);

/** called by the editor's autosave */
export const savePuzzle = (p: Puzzle) => {
  if (storage.savePuzzle(p)) {
    updateIndex(list => list.map(s => (s.id === p.id ? summarize(p) : s)));
  }
};

/** a solver's letters in play mode, kept apart from the puzzle */
export const loadProgress = (id: string) => storage.loadProgress(id);
export const saveProgress = (id: string, progress: PlayProgress) => storage.saveProgress(id, progress);

export const duplicatePuzzle = (id: string) => {
  const p = storage.loadPuzzle(id);
  if (!p) return undefined;
  const now = Date.now();
  return add({ ...p, id: newId(), title: `${p.title} (copy)`, created: now, updated: now, revision: 1 });
};

/** a new puzzle with the template's grid (blocks and bars only) */
export const newFromTemplate = (id: string, title?: string) => {
  const t = storage.loadPuzzle(id);
  return t ? add(fromTemplate(t, title)) : undefined;
};

/** mark a puzzle as a template, or back to an ordinary puzzle */
export const markTemplate = (id: string, template: boolean) => {
  const p = storage.loadPuzzle(id);
  if (!p) return;
  if (template) p.template = true;
  else delete p.template;
  p.revision++;
  if (storage.savePuzzle(p)) updateIndex(list => list.map(s => (s.id === id ? summarize(p) : s)));
};

export const deletePuzzle = (id: string) => {
  storage.removePuzzle(id);
  updateIndex(list => list.filter(s => s.id !== id));
};

const download = (json: string, name: string) => {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportPuzzle = (p: Puzzle) =>
  download(serialize(p), `${(p.title || 'puzzle').replace(/[^\w\- ]+/g, '').trim() || 'puzzle'}.json`);

/**
 * every puzzle, template and logged clue in one file, for backup. if the
 * clue log can't be read the puzzles are saved anyway; returns a warning then.
 */
export const exportLibrary = async () => {
  const puzzles = library.puzzles.map(s => storage.loadPuzzle(s.id)).filter(p => p !== undefined);
  let clues: ClueRecord[] = [];
  let warning = '';
  try {
    clues = await allClues();
  } catch (err) {
    warning = `The backup has your puzzles but not the clue log: ${(err as Error).message}`;
  }
  download(serializeLibrary({ puzzles, clues }), `cross-library-${new Date().toISOString().slice(0, 10)}.json`);
  return warning;
};

export type ImportResult =
  | { kind: 'puzzle'; puzzle: Puzzle }
  /**
   * puzzles and clues already here (by id) are skipped. `failed` puzzles
   * couldn't be saved (storage full); `clueError` says why no clues were added.
   */
  | { kind: 'library'; added: number; existing: number; unreadable: number; failed: number; clues: number; clueError?: string };

/**
 * import a puzzle or a library backup. a single puzzle with a clashing id
 * gets a fresh one; a backup skips puzzles already here. nothing is overwritten.
 */
export const importFile = async (file: File): Promise<ImportResult> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const backup = parseBackup(raw);
  if (backup) {
    const result = restore(backup.puzzles, backup.unreadable);
    try {
      result.clues = await mergeClues(backup.clues);
    } catch (err) {
      result.clueError = (err as Error).message;
    }
    return result;
  }
  const p = migrate(raw);
  if (!p) throw new Error('That file is not a puzzle or library backup this app can read.');
  if (library.puzzles.some(s => s.id === p.id)) {
    p.id = newId();
    p.revision = 1;
  }
  p.updated = Date.now();
  return { kind: 'puzzle', puzzle: add(p) };
};

/** puzzles keep their own dates, so the library order matches the backup's */
const restore = (puzzles: Puzzle[], unreadable: number): Extract<ImportResult, { kind: 'library' }> => {
  const have = new Set(library.puzzles.map(s => s.id));
  const fresh = puzzles.filter(p => {
    if (have.has(p.id)) return false;
    have.add(p.id);
    return true;
  });
  const saved = fresh.filter(p => storage.savePuzzle(p));
  if (saved.length) updateIndex(list => [...saved.map(summarize), ...list]);
  return { kind: 'library', added: saved.length, existing: puzzles.length - fresh.length, unreadable, failed: fresh.length - saved.length, clues: 0 };
};
