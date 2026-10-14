import { describe, expect, it } from 'vitest';
import { describeEntry, describeGrid, describePuzzle, resolveRef } from './describe';
import { computeLights } from './lights';
import { computeEntries } from './links';
import { gridFrom } from './test-helpers';
import type { ClueEntry, LightKey } from './types';

// 1 . 2 . 3
// . # . # .
// 4 . . . .
// . # . # .
// 5 . . . .
const grid = gridFrom(['CAT..', '.#.#.', '.....', '.#.#.', '.....']);
const map = computeLights(grid);
const key = (number: number, dir: 'across' | 'down') => map.lights.find(l => l.number === number && l.dir === dir)!.key;

const puzzle = (clues: Partial<Record<LightKey, ClueEntry>> = {}) => ({
  title: 'Test',
  setter: 'Me',
  style: 'blocked' as const,
  ...grid,
  clues,
});

describe('describeGrid', () => {
  it('writes blocks, empties and letters', () => {
    expect(describeGrid(puzzle()).split('\n')).toEqual(['CAT..', '.#.#.', '.....', '.#.#.', '.....']);
  });

  it('shows bars', () => {
    const barred = gridFrom(['A|B', 'CD'], [[0, 0]]);
    expect(describeGrid({ ...puzzle(), ...barred, style: 'barred' })).toBe('A|B\nCD\nbars below: r1c1');
  });
});

describe('describePuzzle', () => {
  it('lists every entry with pattern, enumeration, clue and mark', () => {
    const text = describePuzzle(
      puzzle({ [key(1, 'across')]: { text: 'Pet  ', enumeration: '', status: 'good' as const, explanation: 'def' } }),
      map,
      computeEntries(map, {}),
    );
    expect(text).toContain('1a (5) CAT.. clue: "Pet" mark: good explanation: "def"');
    expect(text).toContain('2d (5) T.... clue: none');
    expect(text).toContain('5x5 blocked grid, 3/21 squares filled');
  });

  it('writes linked entries once, with their parts', () => {
    const links = { [key(1, 'across')]: [key(5, 'across')] };
    const text = describePuzzle(puzzle({ [key(1, 'across')]: { text: 'Long', enumeration: '5,5', links: links[key(1, 'across')] } }), map, computeEntries(map, links));
    expect(text).toContain('1a (1/5 across) (5,5) CAT....... clue: "Long"');
    expect(text).toContain('Linked: 5a see 1a');
  });
});

describe('describeEntry', () => {
  it('says what crosses each square', () => {
    const entries = computeEntries(map, {});
    const entry = entries.byLight.get(key(4, 'across'))!;
    expect(describeEntry(puzzle(), map, entries, entry)).toContain('Squares: 1 . crosses 1d; 2 . unchecked; 3 . crosses 2d');
  });
});

describe('resolveRef', () => {
  const entries = computeEntries(map, { [key(1, 'across')]: [key(5, 'across')] });
  const ref = (text: string) => {
    const r = resolveRef(text, map, entries);
    return 'error' in r ? r.error : r.key;
  };

  it('reads the usual forms', () => {
    expect(ref('4a')).toBe(key(4, 'across'));
    expect(ref('4 across')).toBe(key(4, 'across'));
    expect(ref('4ac')).toBe(key(4, 'across'));
    expect(ref('2 dn')).toBe(key(2, 'down'));
    expect(ref('2')).toBe(key(2, 'down'));
    expect(ref('3D')).toBe(key(3, 'down'));
    expect(ref('4')).toBe(key(4, 'across'));
  });

  it('finds the whole answer from any part', () => {
    expect(ref('5a')).toBe(key(1, 'across'));
    expect(ref('1/5')).toBe(key(1, 'across'));
  });

  it('explains what it can not read', () => {
    expect(ref('1')).toMatch(/both across and down/);
    expect(ref('9a')).toMatch(/no 9 across/);
    expect(ref('one across')).toMatch(/Couldn't read/);
  });
});
