import { createContext, createMemo, createSignal, createStore, flush, onSettled, snapshot } from 'solid-js';
import { type GridShape, computeLights, lightAt } from '../model/lights';
import { type Selection, settle } from '../model/navigation';
import { normalizeBlocked } from '../model/puzzle';
import { type WarningKind, computeStats } from '../model/stats';
import { type Entry, type LinkMap, computeEntries } from '../model/links';
import { type Feature, symmetricPartner } from '../model/symmetry';
import { type Transform, transformGrid } from '../model/transform';
import type { ClueEntry, Direction, Light, LightKey, Puzzle, Symmetry } from '../model/types';
import { savePuzzle } from './library';

export type Mode = 'design' | 'fill';

const HISTORY_LIMIT = 200;
const SAVE_DELAY = 300;

export interface EditorOptions {
  /** where changes are saved; the library by default. play mode saves the solver's letters instead */
  save?: (p: Puzzle) => void;
  /** the starting mode; by default fill if the grid has letters, else design */
  mode?: Mode;
}

/**
 * state for one open puzzle. create inside a component (it owns memos
 * and effects) and share via EditorContext.
 */
export const createEditor = (initial: Puzzle, options: EditorOptions = {}) => {
  const [puzzle, setPuzzle] = createStore<Puzzle>(initial);

  /**
   * the grid's structure (blocks and bars) as plain data. this is the one
   * computation that reads every cell; lights and stats derive from it, and
   * since it never reads letters, typing doesn't renumber the grid.
   */
  const shape = createMemo<GridShape>(() => ({
    rows: puzzle.rows,
    cols: puzzle.cols,
    cells: puzzle.cells.map(c => ({ block: c.block, barRight: c.barRight, barBottom: c.barBottom })),
  }), { name: 'shape' });

  const map = createMemo(() => computeLights(shape()), { name: 'lights' });
  const stats = createMemo(() => computeStats(shape(), map(), puzzle.symmetry), { name: 'stats' });
  const filled = createMemo(() => puzzle.cells.reduce((n, c) => n + (c.letter ? 1 : 0), 0), { name: 'filled' });
  const autoFilled = createMemo(() => puzzle.cells.reduce((n, c) => n + (c.auto ? 1 : 0), 0), { name: 'autoFilled' });
  /** whether any clue has text, an enumeration or links */
  const hasClues = createMemo(
    () => Object.values(puzzle.clues).some(c => c && (c.text || c.enumeration || c.links?.length)),
    { name: 'hasClues' },
  );

  const hasLetters = initial.cells.some(c => c.letter);
  const [mode, setModeSignal] = createSignal<Mode>(options.mode ?? (hasLetters ? 'fill' : 'design'));

  const firstWhite = Math.max(0, initial.cells.findIndex(c => !c.block));
  const [selection, setSelection] = createSignal<Selection>({ cell: firstWhite, dir: 'across' });

  /** a stats warning whose cells are flagged in the grid; follows the grid as it changes */
  const [flaggedKind, setFlaggedKind] = createSignal<WarningKind>();
  const flagged = createMemo<ReadonlySet<number>>(() => {
    const kind = flaggedKind();
    return new Set(kind ? stats().warnings.find(w => w.kind === kind)?.cells : []);
  });

  /**
   * ghost letters shown in empty cells: a hovered suggestion, or an
   * auto-fill result awaiting Apply (which may also replace auto letters)
   */
  const [preview, setPreview] = createSignal<{ cells: number[]; word: string; replaceAuto?: boolean }>();

  /** the grid registers its focus function so other panels can hand focus back */
  let gridFocus = () => {};
  const registerGridFocus = (fn: () => void) => {
    gridFocus = fn;
  };

  /** likewise the tools dock, so a clue row can open a helper */
  let toolShow = (_id: string) => {};
  const registerShowTool = (fn: (id: string) => void) => {
    toolShow = fn;
  };

  const currentLight = createMemo(() => {
    if (mode() !== 'fill') return undefined;
    const sel = selection();
    return lightAt(map(), sel.cell, sel.dir);
  });

  /** each head light's links; only changes when a link does, not as clue text is typed */
  const links = createMemo<LinkMap>(
    () => {
      const out: LinkMap = {};
      for (const light of map().lights) {
        const keys = puzzle.clues[light.key]?.links;
        if (keys?.length) out[light.key] = [...keys];
      }
      return out;
    },
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b), name: 'links' },
  );

  /** answers: single lights, and chains of linked lights */
  const entries = createMemo(() => computeEntries(map(), links()), { name: 'entries' });

  /** the answer the selected light belongs to */
  const currentEntry = createMemo<Entry | undefined>(() => {
    const light = currentLight();
    return light && entries().byLight.get(light.key);
  });

  // --- history ---------------------------------------------------------

  const undoStack: Puzzle[] = [];
  const redoStack: Puzzle[] = [];
  let lastGroup: string | undefined;
  const [historySize, setHistorySize] = createSignal({ undo: 0, redo: 0 });
  const syncHistory = () => setHistorySize({ undo: undoStack.length, redo: redoStack.length });

  /**
   * apply a change, recording an undo step. consecutive changes with the
   * same group (e.g. typing into one light) share a single undo step.
   */
  /**
   * an independent copy of the current state. snapshot() alone returns the
   * store's raw backing object, which aliases live data: handing it back to
   * setPuzzle later looks like "no change", so history must clone.
   */
  const copy = () => structuredClone(snapshot(puzzle)) as Puzzle;

  /** bumped by every change to cells (letters, blocks, bars), and by undo/redo */
  const [gridVersion, setGridVersion] = createSignal(0);

  const commit = (fn: (draft: Puzzle) => void, group?: string, touchesGrid = true) => {
    flush();
    if (touchesGrid) setGridVersion(v => v + 1);
    if (!group || group !== lastGroup) {
      undoStack.push(copy());
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    lastGroup = group;
    redoStack.length = 0;
    syncHistory();
    setPuzzle(draft => {
      fn(draft);
      draft.updated = Date.now();
    });
    scheduleSave();
  };

  const restore = (from: Puzzle[], to: Puzzle[]) => {
    flush();
    const prev = from.pop();
    if (!prev) return;
    to.push(copy());
    lastGroup = undefined;
    syncHistory();
    setGridVersion(v => v + 1);
    setPuzzle(() => ({ ...prev, updated: Date.now() }));
    scheduleSave();
  };

  const undo = () => restore(undoStack, redoStack);
  const redo = () => restore(redoStack, undoStack);

  // --- persistence -----------------------------------------------------
  // every change goes through commit() or restore(), so they schedule the
  // save. (a deep-tracking effect would subscribe to thousands of nodes.)

  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const saveNow = () => {
    clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    flush();
    (options.save ?? savePuzzle)(snapshot(puzzle) as Puzzle);
  };

  const scheduleSave = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY);
  };

  onSettled(() => {
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.removeEventListener('pagehide', saveNow);
      saveNow();
    };
  });

  // --- selection -------------------------------------------------------

  const select = (cell: number, dir: Direction = selection().dir) => {
    setSelection(mode() === 'fill' ? settle(map(), { cell, dir }) : { cell, dir });
  };

  const selectLight = (light: Light, cell = light.cells[0]) => {
    setSelection({ cell: light.cells.includes(cell) ? cell : light.cells[0], dir: light.dir });
  };

  const setMode = (next: Mode) => {
    setModeSignal(next);
    if (next === 'fill') {
      const sel = selection();
      const m = map();
      if (puzzle.cells[sel.cell].block || (m.across[sel.cell] < 0 && m.down[sel.cell] < 0)) {
        if (m.lights.length) selectLight(m.lights[0]);
      }
      else setSelection(settle(m, sel));
    }
  };

  // --- edits -----------------------------------------------------------

  const toggleFeature = (feature: Feature, row: number, col: number) => {
    const { rows, cols, symmetry } = puzzle;
    if (row < 0 || col < 0 || row >= rows || col >= cols) return;
    // bars on the outer edge mean nothing
    if (feature === 'barRight' && col === cols - 1) return;
    if (feature === 'barBottom' && row === rows - 1) return;
    const value = !puzzle.cells[row * cols + col][feature];
    const targets = [{ feature, row, col }];
    const partner = symmetricPartner({ feature, row, col }, rows, cols, symmetry);
    if (partner) targets.push(partner);
    commit(draft => {
      for (const t of targets) {
        const cell = draft.cells[t.row * cols + t.col];
        cell[t.feature] = value;
        if (t.feature === 'block' && value) {
          cell.letter = '';
          cell.auto = false;
        }
      }
    });
  };

  /** rotate or mirror the whole grid; the selection moves with its cell */
  const transform = (kind: Transform) => {
    const next = transformGrid(puzzle, kind);
    const sel = selection();
    setPreview(undefined);
    commit(draft => {
      draft.rows = next.rows;
      draft.cols = next.cols;
      draft.cells = next.cells;
      draft.clues = next.clues;
    });
    flush();
    const dir = kind === 'rotate' ? (sel.dir === 'across' ? 'down' : 'across') : sel.dir;
    select(next.moved[sel.cell], dir);
  };

  const setLetter = (cell: number, letter: string, group?: string) => {
    const current = puzzle.cells[cell];
    if (current.block || (current.letter === letter && !current.auto)) return;
    commit(draft => {
      draft.cells[cell].letter = letter;
      draft.cells[cell].auto = false;
    }, group);
  };

  /** fill a light or a whole linked entry; the enumeration goes on its clue */
  const fillLight = (target: Pick<Light | Entry, 'key' | 'cells'>, letters: string, enumeration?: string) => {
    commit(draft => {
      target.cells.forEach((cell, i) => {
        draft.cells[cell].letter = letters[i] || '';
        draft.cells[cell].auto = false;
      });
      if (enumeration !== undefined) {
        const entry = draft.clues[target.key] ?? { text: '', enumeration: '' };
        draft.clues[target.key] = { ...entry, enumeration };
      }
    });
  };

  /** clear letters, clues (text, enumerations and links), or both as one undo step */
  const clear = (what: { letters?: boolean; clues?: boolean }) => {
    commit(draft => {
      if (what.letters) {
        for (const cell of draft.cells) {
          cell.letter = '';
          cell.auto = false;
        }
      }
      if (what.clues) draft.clues = {};
    }, undefined, !!what.letters);
  };
  const clearLetters = () => clear({ letters: true });

  /**
   * apply an auto-fill result ('.' for no letter). your own letters are
   * never touched; with replaceAuto, earlier auto-fill letters give way.
   */
  const applyFill = (letters: string, replaceAuto: boolean) => {
    commit(draft => {
      draft.cells.forEach((cell, i) => {
        if (cell.block) return;
        if (cell.letter && !(cell.auto && replaceAuto)) return;
        const next = letters[i] && letters[i] !== '.' ? letters[i] : '';
        cell.letter = next;
        cell.auto = !!next;
      });
    });
  };

  /**
   * make letters yours, as if typed: auto-fill letters in these cells stop
   * being auto, and empty cells take the given letters ('.' for none)
   */
  const commitLetters = (cells: readonly number[], letters = '') => {
    commit(draft => {
      cells.forEach((i, n) => {
        const cell = draft.cells[i];
        const next = letters[n] && letters[n] !== '.' ? letters[n] : '';
        if (next && (!cell.letter || cell.auto)) cell.letter = next;
        if (cell.letter) cell.auto = false;
      });
    });
  };

  const clearAutoFill = () => {
    commit(draft => {
      for (const cell of draft.cells) {
        if (!cell.auto) continue;
        cell.letter = '';
        cell.auto = false;
      }
    });
  };

  const setClue = (key: LightKey, patch: Partial<ClueEntry>) => {
    commit(draft => {
      const entry = draft.clues[key] ?? { text: '', enumeration: '' };
      draft.clues[key] = { ...entry, ...patch };
    }, `clue:${key}:${Object.keys(patch).join()}`, false);
  };

  /** link a head light to the lights its answer continues into ([] unlinks) */
  const setLinks = (key: LightKey, keys: LightKey[]) => {
    commit(draft => {
      const { links: _, ...entry } = draft.clues[key] ?? { text: '', enumeration: '' };
      draft.clues[key] = keys.length ? { ...entry, links: keys } : entry;
    }, undefined, false);
  };

  /** the block list, as a plain array that only changes when its contents do */
  const blocked = createMemo(() => [...puzzle.blocked], { equals: (a, b) => a.join() === b.join(), name: 'blocked' });

  const blockWords = (words: readonly string[]) => {
    const next = normalizeBlocked([...puzzle.blocked, ...words]);
    if (next.join() === puzzle.blocked.join()) return;
    commit(d => { d.blocked = next; }, undefined, false);
  };
  const unblockWord = (word: string) => commit(d => { d.blocked = d.blocked.filter(w => w !== word); }, undefined, false);
  const clearBlocked = () => commit(d => { d.blocked = []; }, undefined, false);

  /** words the auto-fill must include */
  const required = createMemo(() => [...puzzle.required], { equals: (a, b) => a.join() === b.join(), name: 'required' });

  const requireWords = (words: readonly string[]) => {
    const next = normalizeBlocked([...puzzle.required, ...words]);
    if (next.join() === puzzle.required.join()) return;
    commit(d => { d.required = next; }, undefined, false);
  };
  const unrequireWord = (word: string) => commit(d => { d.required = d.required.filter(w => w !== word); }, undefined, false);

  const setTitle = (title: string) => commit(d => { d.title = title; }, 'title', false);
  const setSetter = (setter: string) => commit(d => { d.setter = setter; }, 'setter', false);
  const setSymmetry = (symmetry: Symmetry) => commit(d => { d.symmetry = symmetry; }, undefined, false);

  return {
    puzzle, map, stats, filled, autoFilled, hasClues, gridVersion, mode, setMode, selection, select, selectLight, setSelection,
    currentLight, entries, currentEntry, flagged, flaggedKind, setFlaggedKind,
    registerGridFocus, focusGrid: () => gridFocus(),
    registerShowTool, showTool: (id: string) => toolShow(id),
    preview, setPreview,
    canUndo: () => historySize().undo > 0,
    canRedo: () => historySize().redo > 0,
    undo, redo,
    toggleFeature, transform, setLetter, fillLight, clear, clearLetters, applyFill, commitLetters, clearAutoFill, setClue, setLinks, setTitle, setSetter, setSymmetry,
    blocked, blockWords, unblockWord, clearBlocked,
    required, requireWords, unrequireWord,
    saveNow,
  };
};

export type Editor = ReturnType<typeof createEditor>;

export const EditorContext = createContext<Editor>();
