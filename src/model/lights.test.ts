import { describe, expect, it } from 'vitest';
import { computeLights, lightAt } from './lights';
import { createPuzzle } from './puzzle';
import { gridFrom } from './test-helpers';

const summary = (map: ReturnType<typeof computeLights>) =>
  map.lights.map(l => `${l.number}${l.dir === 'across' ? 'a' : 'd'}${l.length}`);

describe('computeLights, blocked', () => {
  it('numbers a 15x15 lattice like a standard cryptic starting grid', () => {
    const p = createPuzzle({ rows: 15, cols: 15, style: 'blocked', symmetry: 'rotational', template: 'lattice' });
    const map = computeLights(p);
    const across = map.lights.filter(l => l.dir === 'across');
    const down = map.lights.filter(l => l.dir === 'down');
    expect(across).toHaveLength(8);
    expect(down).toHaveLength(8);
    expect(across.every(l => l.length === 15)).toBe(true);
    // row 0: every even column starts a down light -> 1..8; 1 is also across
    expect(down.map(l => l.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(across.map(l => l.number)).toEqual([1, 9, 10, 11, 12, 13, 14, 15]);
    // odd row cells at even columns are unchecked (down only)
    expect(lightAt(map, 1 * 15 + 0, 'across')).toBeUndefined();
    expect(lightAt(map, 1 * 15 + 0, 'down')?.number).toBe(1);
  });

  it('numbers a small grid row-major, skipping 1-cell runs', () => {
    const map = computeLights(gridFrom([
      '...#.',
      '.#...',
      '.....',
      '...#.',
      '#....',
    ]));
    // grid:  ...#.   numbers: 1 . 2 # 3
    //        .#...            . # 4 5 .
    //        .....            6 7 . . .
    //        ...#.            8 . . # .
    //        #....            # 9 . . .
    // (0,1) heads a 1-cell down run, so it gets no number
    expect(summary(map)).toEqual([
      '1a3', '4a3', '6a5', '8a3', '9a4',
      '1d4', '2d5', '3d5', '5d2', '7d3',
    ]);
  });
});

describe('computeLights, barred', () => {
  it('bars split lights and short runs are not lights', () => {
    // 3x4, bar after column 0 in row 0 => row 0 across is a 1-run + 3-run
    const map = computeLights(gridFrom([
      '.|...',
      '....',
      '....',
    ]));
    const across = map.lights.filter(l => l.dir === 'across');
    expect(across.map(l => [l.row, l.col, l.length])).toEqual([[0, 1, 3], [1, 0, 4], [2, 0, 4]]);
    // cell (0,0) is in a down light only
    expect(map.across[0]).toBe(-1);
    expect(map.down[0]).toBeGreaterThanOrEqual(0);
  });

  it('bottom bars split down lights', () => {
    const map = computeLights(gridFrom(['...', '...', '...', '...'], [[1, 1]]));
    const col1 = map.lights.filter(l => l.dir === 'down' && l.col === 1);
    expect(col1.map(l => [l.row, l.length])).toEqual([[0, 2], [2, 2]]);
  });

  it('bars on the outer edge change nothing', () => {
    const plain = computeLights(gridFrom(['...', '...', '...']));
    const edged = computeLights(gridFrom(['...|', '...|', '...|'], [[2, 0], [2, 1], [2, 2]]));
    expect(summary(edged)).toEqual(summary(plain));
  });
});
