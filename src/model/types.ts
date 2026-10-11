export type Direction = 'across' | 'down';
export type GridStyle = 'blocked' | 'barred';
export type Symmetry = 'rotational' | 'none';

export interface Cell {
  block: boolean;
  /** thick bar on the right edge of this cell (barred grids) */
  barRight: boolean;
  /** thick bar on the bottom edge of this cell (barred grids) */
  barBottom: boolean;
  /** '' or a single uppercase letter */
  letter: string;
  /** the letter was placed by the auto-fill (a re-fill may replace it) */
  auto: boolean;
}

/** start row, start column and direction: stable across renumbering */
export type LightKey = `${number},${number},${'A' | 'D'}`;

export interface ClueEntry {
  text: string;
  /** e.g. "3,4" or "4-5"; '' means the default, the light length */
  enumeration: string;
  /**
   * linked clues: the lights this answer continues into, in order. set on
   * the first light, whose clue and enumeration cover the whole answer.
   */
  links?: LightKey[];
  /** how the clue works, shown to a solver once the puzzle is solved. optional: doesn't count towards finishing */
  explanation?: string;
}

export const SCHEMA_VERSION = 1;

export interface Puzzle {
  schema: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  setter: string;
  created: number;
  updated: number;
  /**
   * counts saves: +1 each time the editor persists a change (autosave
   * batches a burst of edits into one). unlike `updated` it doesn't depend
   * on a device's clock, so copies of a puzzle can be ordered when merging.
   * a new puzzle (or a copy with a new id) starts at 1; 0 means saved
   * before revisions existed.
   */
  revision: number;
  rows: number;
  cols: number;
  style: GridStyle;
  symmetry: Symmetry;
  /** flat, row-major */
  cells: Cell[];
  clues: Partial<Record<LightKey, ClueEntry>>;
  /** words never offered by suggestions, helpers or the auto-fill: uppercase A-Z, sorted */
  blocked: string[];
  /** words the auto-fill must include: uppercase A-Z, sorted */
  required: string[];
  /** a grid kept for starting new puzzles from (see fromTemplate) */
  template?: boolean;
}

export interface Light {
  key: LightKey;
  number: number;
  dir: Direction;
  row: number;
  col: number;
  length: number;
  /** cell indexes, in order */
  cells: number[];
}

export interface CellPos {
  row: number;
  col: number;
}

export const lightKey = (row: number, col: number, dir: Direction): LightKey =>
  `${row},${col},${dir === 'across' ? 'A' : 'D'}`;

export const emptyCell = (): Cell => ({ block: false, barRight: false, barBottom: false, letter: '', auto: false });
