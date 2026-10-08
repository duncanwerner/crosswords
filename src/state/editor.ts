import { createContext, createMemo, createSignal, createStore, flush, onSettled, snapshot } from 'solid-js';
import { type GridShape, computeLights, lightAt } from '../model/lights';
import { type Selection, settle } from '../model/navigation';
import { type WarningKind, computeStats } from '../model/stats';
import { type Feature, symmetricPartner } from '../model/symmetry';
import type { ClueEntry, Direction, Light, LightKey, Puzzle, Symmetry } from '../model/types';
import { savePuzzle } from './library';

export type Mode = 'design' | 'fill';

const HISTORY_LIMIT = 200;
const SAVE_DELAY = 300;

/**
 * state for one open puzzle. create inside a component (it owns memos
 * and effects) and share via EditorContext.
 */
export const createEditor = (initial: Puzzle) => {
  const [puzzle, setPuzzle] = createStore<Puzzle>(initial);

  /**
   * the grid's structure (blocks and bars) as plain data. this is the one
   * computation that reads every cell; lights and stats derive from it, and
   * since it never reads letters, typing doesn't renumber the grid.
   */
  const shape = createMemo<GridShape>(() => ({
    rows: puzzle.rows,
    cols: puzzle.cols,
    cells: puzzle.cells.map(c => ({ block: c.block, barRight: c.barRight, barBottom: c.barBottom, letter: '' })),
  }), { name: 'shape' });

  const map = createMemo(() => computeLights(shape()), { name: 'lights' });
  const stats = createMemo(() => computeStats(shape(), map(), puzzle.symmetry), { name: 'stats' });
  const filled = createMemo(() => puzzle.cells.reduce((n, c) => n + (c.letter ? 1 : 0), 0), { name: 'filled' });

  const hasLetters = initial.cells.some(c => c.letter);
  const [mode, setModeSignal] = createSignal<Mode>(hasLetters ? 'fill' : 'design');

  const firstWhite = Math.max(0, initial.cells.findIndex(c => !c.block));
  const [selection, setSelection] = createSignal<Selection>({ cell: firstWhite, dir: 'across' });

  /** a stats warning whose cells are flagged in the grid; follows the grid as it changes */
  const [flaggedKind, setFlaggedKind] = createSignal<WarningKind>();
  const flagged = createMemo<ReadonlySet<number>>(() => {
    const kind = flaggedKind();
    return new Set(kind ? stats().warnings.find(w => w.kind === kind)?.cells : []);
  });

  /** ghost letters shown in empty cells while hovering a suggestion */
  const [preview, setPreview] = createSignal<{ cells: number[]; word: string }>();

  /** the grid registers its focus function so other panels can hand focus back */
  let gridFocus = () => {};
  const registerGridFocus = (fn: () => void) => {
    gridFocus = fn;
  };

  const currentLight = createMemo(() => {
    if (mode() !== 'fill') return undefined;
    const sel = selection();
    return lightAt(map(), sel.cell, sel.dir);
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

  const commit = (fn: (draft: Puzzle) => void, group?: string) => {
    flush();
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
    savePuzzle(snapshot(puzzle) as Puzzle);
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
        if (t.feature === 'block' && value) cell.letter = '';
      }
    });
  };

  const setLetter = (cell: number, letter: string, group?: string) => {
    if (puzzle.cells[cell].block || puzzle.cells[cell].letter === letter) return;
    commit(draft => {
      draft.cells[cell].letter = letter;
    }, group);
  };

  const fillLight = (light: Light, letters: string, enumeration?: string) => {
    commit(draft => {
      light.cells.forEach((cell, i) => {
        draft.cells[cell].letter = letters[i] || '';
      });
      if (enumeration !== undefined) {
        const entry = draft.clues[light.key] ?? { text: '', enumeration: '' };
        draft.clues[light.key] = { ...entry, enumeration };
      }
    });
  };

  const clearLetters = () => {
    commit(draft => {
      for (const cell of draft.cells) cell.letter = '';
    });
  };

  const setClue = (key: LightKey, patch: Partial<ClueEntry>) => {
    commit(draft => {
      const entry = draft.clues[key] ?? { text: '', enumeration: '' };
      draft.clues[key] = { ...entry, ...patch };
    }, `clue:${key}:${Object.keys(patch).join()}`);
  };

  const setTitle = (title: string) => commit(d => { d.title = title; }, 'title');
  const setSetter = (setter: string) => commit(d => { d.setter = setter; }, 'setter');
  const setSymmetry = (symmetry: Symmetry) => commit(d => { d.symmetry = symmetry; });

  return {
    puzzle, map, stats, filled, mode, setMode, selection, select, selectLight, setSelection,
    currentLight, flagged, flaggedKind, setFlaggedKind,
    registerGridFocus, focusGrid: () => gridFocus(),
    preview, setPreview,
    canUndo: () => historySize().undo > 0,
    canRedo: () => historySize().redo > 0,
    undo, redo,
    toggleFeature, setLetter, fillLight, clearLetters, setClue, setTitle, setSetter, setSymmetry,
    saveNow,
  };
};

export type Editor = ReturnType<typeof createEditor>;

export const EditorContext = createContext<Editor>();
