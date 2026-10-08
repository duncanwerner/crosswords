import { type Cell, emptyCell } from './types';

/**
 * build a grid from rows of text. '#' block, '.' or a letter white.
 * bars: '|' after a cell puts a bar on its right; a separate bars
 * argument lists bottom bars as [row, col].
 */
export const gridFrom = (lines: string[], bottomBars: Array<[number, number]> = []) => {
  const rows = lines.length;
  const cells: Cell[] = [];
  let cols = 0;
  for (const line of lines) {
    let count = 0;
    for (const ch of line) {
      if (ch === '|') {
        cells[cells.length - 1].barRight = true;
        continue;
      }
      const cell = emptyCell();
      if (ch === '#') cell.block = true;
      else if (/[A-Z]/.test(ch)) cell.letter = ch;
      cells.push(cell);
      count++;
    }
    cols = count;
  }
  for (const [r, c] of bottomBars) cells[r * cols + c].barBottom = true;
  return { rows, cols, cells };
};
