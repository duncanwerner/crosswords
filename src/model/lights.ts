import { type Cell, type Direction, type Light, lightKey } from './types';

export interface GridShape {
  rows: number;
  cols: number;
  cells: readonly Cell[];
}

export interface LightMap {
  /** all lights, across first then down, each in number order */
  lights: Light[];
  /** per cell: the across light containing it (index into lights), or -1 */
  across: number[];
  /** per cell: the down light containing it (index into lights), or -1 */
  down: number[];
  /** per cell: clue number shown in the cell, or 0 */
  numbers: number[];
}

/**
 * can we step from (row, col) one cell in the given direction without
 * hitting the edge, a block or a bar?
 */
export const canStep = (grid: GridShape, row: number, col: number, dir: Direction): boolean => {
  const { rows, cols, cells } = grid;
  const cell = cells[row * cols + col];
  if (cell.block) return false;
  if (dir === 'across') {
    if (col + 1 >= cols || cell.barRight) return false;
    return !cells[row * cols + col + 1].block;
  }
  if (row + 1 >= rows || cell.barBottom) return false;
  return !cells[(row + 1) * cols + col].block;
};

/** does a light in this direction start here? (it may still be a 1-cell run) */
const startsRun = (grid: GridShape, row: number, col: number, dir: Direction) => {
  if (grid.cells[row * grid.cols + col].block) return false;
  if (dir === 'across') return col === 0 || !canStep(grid, row, col - 1, 'across');
  return row === 0 || !canStep(grid, row - 1, col, 'down');
};

/**
 * number the grid and list its lights. a light is a run of at least two
 * white cells, ended by the edge, a block or a bar. numbering is row-major,
 * a cell starting an across and/or a down light gets the next number.
 */
export const computeLights = (grid: GridShape): LightMap => {
  const { rows, cols } = grid;
  const n = rows * cols;
  const across: Light[] = [];
  const down: Light[] = [];
  const numbers = new Array<number>(n).fill(0);
  let current = 0;

  const run = (row: number, col: number, dir: Direction) => {
    const list = [row * cols + col];
    let r = row;
    let c = col;
    while (canStep(grid, r, c, dir)) {
      if (dir === 'across') c++;
      else r++;
      list.push(r * cols + c);
    }
    return list;
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let number = 0;
      for (const dir of ['across', 'down'] as const) {
        if (!startsRun(grid, row, col, dir)) continue;
        const cells = run(row, col, dir);
        if (cells.length < 2) continue;
        if (!number) number = ++current;
        (dir === 'across' ? across : down).push({
          key: lightKey(row, col, dir), number, dir, row, col, length: cells.length, cells,
        });
      }
      numbers[row * cols + col] = number;
    }
  }

  const lights = [...across, ...down];
  const acrossMap = new Array<number>(n).fill(-1);
  const downMap = new Array<number>(n).fill(-1);
  lights.forEach((light, i) => {
    const map = light.dir === 'across' ? acrossMap : downMap;
    for (const cell of light.cells) map[cell] = i;
  });

  return { lights, across: acrossMap, down: downMap, numbers };
};

/** the light through a cell in a direction, if any */
export const lightAt = (map: LightMap, cell: number, dir: Direction): Light | undefined => {
  const index = (dir === 'across' ? map.across : map.down)[cell];
  return index >= 0 ? map.lights[index] : undefined;
};
