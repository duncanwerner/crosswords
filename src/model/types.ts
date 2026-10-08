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
}

export const SCHEMA_VERSION = 1;

export interface Puzzle {
  schema: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  setter: string;
  created: number;
  updated: number;
  rows: number;
  cols: number;
  style: GridStyle;
  symmetry: Symmetry;
  /** flat, row-major */
  cells: Cell[];
  clues: Partial<Record<LightKey, ClueEntry>>;
  /** words never offered by suggestions, helpers or the auto-fill: uppercase A-Z, sorted */
  blocked: string[];
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
