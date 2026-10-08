import type { Puzzle } from './types';

/**
 * play mode: solving a puzzle as a solver would. the solver's letters live
 * apart from the puzzle (whose letters are the setter's answers), keyed to
 * the grid's shape so a redesigned grid starts afresh.
 */

export interface PlayProgress {
  /** the grid shape the letters belong to (see gridSignature) */
  grid: string;
  /** one char per cell: A-Z, or '.' for empty */
  letters: string;
}

/** blocks and bars, as a string: changes whenever the lights could */
export const gridSignature = (p: Pick<Puzzle, 'rows' | 'cols' | 'cells'>) =>
  `${p.rows}x${p.cols}:${p.cells.map(c => (c.block ? '#' : String(+c.barRight + 2 * +c.barBottom))).join('')}`;

/** a copy of the puzzle to play: the solver's letters (if they still fit the grid) in place of the answers */
export const puzzleForPlay = (p: Puzzle, progress?: PlayProgress): Puzzle => {
  const copy = structuredClone(p);
  const letters = progress?.grid === gridSignature(p) ? progress.letters : '';
  copy.cells.forEach((cell, i) => {
    const letter = letters[i];
    cell.letter = !cell.block && letter && /^[A-Z]$/.test(letter) ? letter : '';
    cell.auto = false;
  });
  return copy;
};

export const progressOf = (p: Pick<Puzzle, 'rows' | 'cols' | 'cells'>): PlayProgress => ({
  grid: gridSignature(p),
  letters: p.cells.map(c => c.letter || '.').join(''),
});

/** stored progress, if it has the right shape */
export const parseProgress = (raw: unknown): PlayProgress | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const { grid, letters } = raw as Partial<PlayProgress>;
  return typeof grid === 'string' && typeof letters === 'string' ? { grid, letters } : undefined;
};

export type PlayStatus = 'incomplete' | 'solved' | 'wrong' | 'full';

/**
 * how the solver is doing. 'solved' and 'wrong' need the setter's answers
 * in every white square; without them a full grid is just 'full'.
 */
export const playStatus = (answers: Puzzle, played: Pick<Puzzle, 'cells'>): PlayStatus => {
  let checkable = true;
  let right = true;
  for (let i = 0; i < answers.cells.length; i++) {
    const cell = answers.cells[i];
    if (cell.block) continue;
    const letter = played.cells[i]?.letter;
    if (!letter) return 'incomplete';
    if (!cell.letter) checkable = false;
    else if (cell.letter !== letter) right = false;
  }
  return !checkable ? 'full' : right ? 'solved' : 'wrong';
};
