import { computeLights } from './lights';
import type { Cell, ClueEntry, LightKey, Puzzle } from './types';

/** a whole-grid move: a quarter turn clockwise, or a mirror */
export type Transform = 'rotate' | 'flipH' | 'flipV';

type GridParts = Pick<Puzzle, 'rows' | 'cols' | 'cells' | 'clues'>;

export interface Transformed extends GridParts {
  /** old cell index -> new cell index */
  moved: number[];
}

/**
 * rotate or mirror the grid. letters travel with their cells, and bars
 * with the edge they sit on. a clue follows its light when the light
 * still reads the same way; lights that end up reversed lose their clue.
 */
export const transformGrid = (grid: GridParts, transform: Transform): Transformed => {
  const { rows, cols, cells } = grid;
  const newRows = transform === 'rotate' ? cols : rows;
  const newCols = transform === 'rotate' ? rows : cols;

  const place = (row: number, col: number): [number, number] => {
    switch (transform) {
      case 'rotate': return [col, rows - 1 - row];
      case 'flipH': return [row, cols - 1 - col];
      case 'flipV': return [rows - 1 - row, col];
    }
  };

  const moved: number[] = [];
  const next: Cell[] = Array.from({ length: newRows * newCols });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [nr, nc] = place(r, c);
      const i = nr * newCols + nc;
      moved[r * cols + c] = i;
      next[i] = { ...cells[r * cols + c], barRight: false, barBottom: false };
    }
  }

  // a bar separates two neighbours; find them again and bar the edge between
  const bar = (a: number, b: number) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (hi - lo === 1) next[lo].barRight = true;
    else next[lo].barBottom = true;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (cells[i].barRight && c < cols - 1) bar(moved[i], moved[i + 1]);
      if (cells[i].barBottom && r < rows - 1) bar(moved[i], moved[i + cols]);
    }
  }

  const newLights = new Map(
    computeLights({ rows: newRows, cols: newCols, cells: next }).lights.map(l => [l.cells.join(), l.key]),
  );
  const clues: Partial<Record<LightKey, ClueEntry>> = {};
  for (const light of computeLights(grid).lights) {
    const entry = grid.clues[light.key];
    const key = newLights.get(light.cells.map(i => moved[i]).join());
    if (entry && key) clues[key] = entry;
  }

  return { rows: newRows, cols: newCols, cells: next, clues, moved };
};
