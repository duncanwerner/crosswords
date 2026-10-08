import { describe, expect, it } from 'vitest';
import { gridSignature, parseProgress, playStatus, progressOf, puzzleForPlay } from './play';
import { createPuzzle } from './puzzle';

const puzzle = () => {
  const p = createPuzzle({ rows: 3, cols: 3, style: 'blocked', symmetry: 'rotational', template: 'empty' });
  'COWARETEN'.split('').forEach((l, i) => (p.cells[i].letter = l));
  p.cells[0].auto = true;
  return p;
};

describe('play', () => {
  it('starts with an empty grid, leaving the puzzle alone', () => {
    const p = puzzle();
    const play = puzzleForPlay(p);
    expect(play.cells.every(c => c.letter === '' && !c.auto)).toBe(true);
    expect(p.cells[0].letter).toBe('C');
  });

  it('restores progress that fits the grid', () => {
    const p = puzzle();
    const play = puzzleForPlay(p);
    play.cells[4].letter = 'R';
    const progress = progressOf(play);
    expect(progress.letters).toBe('....R....');
    expect(puzzleForPlay(p, progress).cells[4].letter).toBe('R');
  });

  it('drops progress once the grid changes', () => {
    const p = puzzle();
    const progress = { grid: gridSignature(p), letters: 'ABCDEFGHI' };
    p.cells[4].block = true;
    expect(puzzleForPlay(p, progress).cells.every(c => c.letter === '')).toBe(true);
    p.cells[4].block = false;
    p.cells[0].barRight = true;
    expect(gridSignature(p)).not.toBe(progress.grid);
  });

  it('ignores junk in stored progress', () => {
    expect(parseProgress({ grid: 1, letters: 'x' })).toBeUndefined();
    expect(parseProgress(null)).toBeUndefined();
    const p = puzzle();
    const play = puzzleForPlay(p, { grid: gridSignature(p), letters: 'a1?' });
    expect(play.cells.every(c => c.letter === '')).toBe(true);
  });

  it('knows when the grid is solved', () => {
    const p = puzzle();
    const play = puzzleForPlay(p);
    expect(playStatus(p, play)).toBe('incomplete');
    'COWARETEN'.split('').forEach((l, i) => (play.cells[i].letter = l));
    expect(playStatus(p, play)).toBe('solved');
    play.cells[8].letter = 'X';
    expect(playStatus(p, play)).toBe('wrong');
    p.cells[8].letter = '';
    expect(playStatus(p, play)).toBe('full');
  });
});
