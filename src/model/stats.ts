import type { GridShape, LightMap } from './lights';
import { symmetricPartner } from './symmetry';
import type { Symmetry } from './types';

export type WarningKind = 'orphan' | 'short' | 'disconnected' | 'asymmetric' | 'unchecked-run';

export interface Warning {
  kind: WarningKind;
  message: string;
  cells: number[];
}

export interface GridStats {
  across: number;
  down: number;
  whites: number;
  blocks: number;
  bars: number;
  checked: number;
  unchecked: number;
  /** lengths[n] = number of lights of length n */
  lengths: number[];
  warnings: Warning[];
}

export const computeStats = (grid: GridShape, map: LightMap, symmetry: Symmetry): GridStats => {
  const { rows, cols, cells } = grid;
  const stats: GridStats = {
    across: 0, down: 0, whites: 0, blocks: 0, bars: 0, checked: 0, unchecked: 0,
    lengths: [], warnings: [],
  };

  for (const light of map.lights) {
    if (light.dir === 'across') stats.across++;
    else stats.down++;
    stats.lengths[light.length] = (stats.lengths[light.length] || 0) + 1;
  }

  const orphans: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.block) {
      stats.blocks++;
      continue;
    }
    stats.whites++;
    const lights = (map.across[i] >= 0 ? 1 : 0) + (map.down[i] >= 0 ? 1 : 0);
    if (lights === 2) stats.checked++;
    else if (lights === 1) stats.unchecked++;
    else orphans.push(i);
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c];
      if (cell.barRight && c < cols - 1) stats.bars++;
      if (cell.barBottom && r < rows - 1) stats.bars++;
    }
  }

  if (orphans.length) {
    stats.warnings.push({
      kind: 'orphan',
      message: `${orphans.length} white cell${orphans.length > 1 ? 's are' : ' is'} not in any light`,
      cells: orphans,
    });
  }

  const short = map.lights.filter(l => l.length === 2);
  if (short.length) {
    stats.warnings.push({
      kind: 'short',
      message: `${short.length} two-letter light${short.length > 1 ? 's' : ''}`,
      cells: short.flatMap(l => l.cells),
    });
  }

  // consecutive unchecked cells in a light are hard on solvers
  const runs: number[] = [];
  for (const light of map.lights) {
    const otherMap = light.dir === 'across' ? map.down : map.across;
    for (let i = 1; i < light.cells.length; i++) {
      const a = light.cells[i - 1];
      const b = light.cells[i];
      if (otherMap[a] < 0 && otherMap[b] < 0) {
        if (!runs.includes(a)) runs.push(a);
        if (!runs.includes(b)) runs.push(b);
      }
    }
  }
  if (runs.length) {
    stats.warnings.push({
      kind: 'unchecked-run',
      message: 'Adjacent unchecked cells in a light',
      cells: runs,
    });
  }

  // connectivity: flood fill white cells through edges with no bar
  const firstWhite = cells.findIndex(c => !c.block);
  if (firstWhite >= 0) {
    const seen = new Uint8Array(cells.length);
    const stack = [firstWhite];
    seen[firstWhite] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const r = Math.floor(i / cols);
      const c = i % cols;
      const visit = (j: number) => {
        if (!seen[j] && !cells[j].block) {
          seen[j] = 1;
          stack.push(j);
        }
      };
      if (c + 1 < cols && !cells[i].barRight) visit(i + 1);
      if (c > 0 && !cells[i - 1].barRight) visit(i - 1);
      if (r + 1 < rows && !cells[i].barBottom) visit(i + cols);
      if (r > 0 && !cells[i - cols].barBottom) visit(i - cols);
    }
    const cut = cells.map((_, i) => i).filter(i => !cells[i].block && !seen[i]);
    if (cut.length) {
      stats.warnings.push({
        kind: 'disconnected',
        message: 'Grid is split into separate parts',
        cells: cut,
      });
    }
  }

  if (symmetry !== 'none') {
    const bad: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        for (const feature of ['block', 'barRight', 'barBottom'] as const) {
          if (!cells[i][feature]) continue;
          if (feature === 'barRight' && c === cols - 1) continue;
          if (feature === 'barBottom' && r === rows - 1) continue;
          const p = symmetricPartner({ feature, row: r, col: c }, rows, cols, symmetry);
          if (!p || !cells[p.row * cols + p.col][feature]) {
            if (!bad.includes(i)) bad.push(i);
          }
        }
      }
    }
    if (bad.length) {
      stats.warnings.push({ kind: 'asymmetric', message: 'Grid is not symmetric', cells: bad });
    }
  }

  return stats;
};
