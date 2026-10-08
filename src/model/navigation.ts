import { type GridShape, type LightMap, lightAt } from './lights';
import type { Direction, Light } from './types';

export interface Selection {
  cell: number;
  dir: Direction;
}

const other = (dir: Direction): Direction => (dir === 'across' ? 'down' : 'across');

/**
 * normalize a selection: if the cell has no light in the requested
 * direction but has one in the other, switch.
 */
export const settle = (map: LightMap, sel: Selection): Selection => {
  if (lightAt(map, sel.cell, sel.dir)) return sel;
  if (lightAt(map, sel.cell, other(sel.dir))) return { cell: sel.cell, dir: other(sel.dir) };
  return sel;
};

/**
 * arrow-key movement: step to the next non-block cell in a direction,
 * skipping over blocks (but not past the edge). bars don't stop movement,
 * they only split lights.
 */
export const move = (grid: GridShape, cell: number, dRow: number, dCol: number): number => {
  const { rows, cols, cells } = grid;
  let r = Math.floor(cell / cols) + dRow;
  let c = (cell % cols) + dCol;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    const index = r * cols + c;
    if (!cells[index].block) return index;
    r += dRow;
    c += dCol;
  }
  return cell;
};

/**
 * arrow-key movement in design mode: blocks are selectable, so plain step.
 */
export const step = (grid: GridShape, cell: number, dRow: number, dCol: number): number => {
  const r = Math.floor(cell / grid.cols) + dRow;
  const c = (cell % grid.cols) + dCol;
  if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return cell;
  return r * grid.cols + c;
};

/** lights in solving order: all across, then all down (as computeLights returns them) */
export const nextLight = (map: LightMap, current: Light | undefined, delta: 1 | -1): Light | undefined => {
  const { lights } = map;
  if (!lights.length) return undefined;
  const index = current ? lights.findIndex(l => l.key === current.key) : -1;
  if (index < 0) return delta > 0 ? lights[0] : lights[lights.length - 1];
  return lights[(index + delta + lights.length) % lights.length];
};

/**
 * move within the current light after typing (forward) or backspacing
 * (backward). stays put at the end of the light.
 */
export const advance = (map: LightMap, sel: Selection, delta: 1 | -1): Selection => {
  const light = lightAt(map, sel.cell, sel.dir);
  if (!light) return sel;
  const pos = light.cells.indexOf(sel.cell);
  const next = pos + delta;
  if (next < 0 || next >= light.length) return sel;
  return { cell: light.cells[next], dir: sel.dir };
};
