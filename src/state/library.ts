import { createStore, snapshot } from 'solid-js';
import { type NewPuzzleOptions, createPuzzle, newId } from '../model/puzzle';
import type { Puzzle } from '../model/types';
import { type PuzzleSummary, createStorage, migrate, serialize, summarize } from './storage';

/**
 * the puzzle library: a module-level (i.e. global) store of summaries,
 * mirrored to localStorage. full puzzles are loaded on demand.
 */

export const storage = createStorage();

const [library, setLibrary] = createStore({ puzzles: storage.loadIndex() });

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

export const duplicatePuzzle = (id: string) => {
  const p = storage.loadPuzzle(id);
  if (!p) return undefined;
  const now = Date.now();
  return add({ ...p, id: newId(), title: `${p.title} (copy)`, created: now, updated: now });
};

export const deletePuzzle = (id: string) => {
  storage.removePuzzle(id);
  updateIndex(list => list.filter(s => s.id !== id));
};

export const exportPuzzle = (p: Puzzle) => {
  const blob = new Blob([serialize(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(p.title || 'puzzle').replace(/[^\w\- ]+/g, '').trim() || 'puzzle'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** import from a file. a clashing id gets a fresh one, so nothing is overwritten. */
export const importPuzzle = async (file: File): Promise<Puzzle> => {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const p = migrate(raw);
  if (!p) throw new Error('That file is not a puzzle this app can read.');
  if (library.puzzles.some(s => s.id === p.id)) p.id = newId();
  p.updated = Date.now();
  return add(p);
};
