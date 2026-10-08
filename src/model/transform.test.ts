import { describe, expect, it } from 'vitest';
import { gridFrom } from './test-helpers';
import { transformGrid } from './transform';
import type { Cell } from './types';

const render = (g: { rows: number; cols: number; cells: Cell[] }) => {
  const lines: string[] = [];
  for (let r = 0; r < g.rows; r++) {
    let line = '';
    for (let c = 0; c < g.cols; c++) {
      const cell = g.cells[r * g.cols + c];
      line += cell.block ? '#' : cell.letter || '.';
      if (cell.barRight) line += '|';
    }
    lines.push(line);
  }
  return lines;
};

const bottomBars = (g: { cols: number; cells: Cell[] }) =>
  g.cells.flatMap((c, i) => (c.barBottom ? [[Math.floor(i / g.cols), i % g.cols]] : []));

describe('transformGrid', () => {
  it('rotates a quarter turn clockwise, swapping dimensions', () => {
    const t = transformGrid({ ...gridFrom(['AB#', 'CDE']), clues: {} }, 'rotate');
    expect([t.rows, t.cols]).toEqual([3, 2]);
    expect(render(t)).toEqual(['CA', 'DB', 'E#']);
  });

  it('mirrors left-right and top-bottom', () => {
    const g = { ...gridFrom(['AB#', 'CDE']), clues: {} };
    expect(render(transformGrid(g, 'flipH'))).toEqual(['#BA', 'EDC']);
    expect(render(transformGrid(g, 'flipV'))).toEqual(['CDE', 'AB#']);
  });

  it('four rotations give back the original', () => {
    const g = { ...gridFrom(['A|B.', '..#'], [[0, 2]]), clues: {} };
    let t = transformGrid(g, 'rotate');
    for (let i = 0; i < 3; i++) t = transformGrid(t, 'rotate');
    expect(t.cells).toEqual(g.cells);
  });

  it('moves bars with their edges', () => {
    // bar between (0,0) and (0,1); bottom bar under (0,2)
    const g = { ...gridFrom(['.|..', '...'], [[0, 2]]), clues: {} };
    const r = transformGrid(g, 'rotate');
    // (0,0)->(0,1), (0,1)->(1,1): bar under (0,1). (0,2)->(2,1), (1,2)->(2,0): bar right of (2,0)
    expect(render(r)).toEqual(['..', '..', '.|.']);
    expect(bottomBars(r)).toEqual([[0, 1]]);
    const h = transformGrid(g, 'flipH');
    expect(render(h)).toEqual(['..|.', '...']);
    expect(bottomBars(h)).toEqual([[0, 0]]);
  });

  it('keeps clues on lights that read the same way and drops reversed ones', () => {
    const g = { ...gridFrom(['...', '.#.', '...']), clues: {
      '0,0,A': { text: 'top', enumeration: '' },
      '0,0,D': { text: 'left', enumeration: '' },
    } };
    // rotating: the top row becomes the right column, read downwards; the
    // left column becomes the top row, read right to left
    expect(transformGrid(g, 'rotate').clues).toEqual({ '0,2,D': { text: 'top', enumeration: '' } });
    // mirroring top-bottom: the top row becomes the bottom row; the left column reverses
    expect(transformGrid(g, 'flipV').clues).toEqual({ '2,0,A': { text: 'top', enumeration: '' } });
  });
});
