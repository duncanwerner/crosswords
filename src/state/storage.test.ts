import { describe, expect, it } from 'vitest';
import { createPuzzle } from '../model/puzzle';
import { createStorage, migrate } from './storage';

const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
};

describe('storage', () => {
  it('round-trips a puzzle, dropping orphaned clues', () => {
    const store = createStorage(memory());
    const p = createPuzzle({ rows: 5, cols: 5, style: 'blocked', symmetry: 'rotational', template: 'lattice' });
    p.cells[0].letter = 'A';
    p.clues['0,0,A'] = { text: 'Clue', enumeration: '2,3' };
    p.clues['1,1,A'] = { text: 'Orphan', enumeration: '' };
    store.savePuzzle(p);
    const back = store.loadPuzzle(p.id)!;
    expect(back.cells).toEqual(p.cells);
    expect(back.clues).toEqual({ '0,0,A': { text: 'Clue', enumeration: '2,3' } });
  });

  it('repairs partial data and rejects junk', () => {
    const p = migrate({ id: 'x', rows: 2, cols: 2, cells: [{ block: true }, { letter: 'b' }] })!;
    expect(p.cells).toHaveLength(4);
    expect(p.cells[1].letter).toBe('B');
    expect(p.style).toBe('blocked');
    expect(migrate({ rows: 2 })).toBeUndefined();
    expect(migrate({ id: 'x', rows: 2, cols: 2, schema: 99 })).toBeUndefined();
  });

  it('survives broken storage', () => {
    const store = createStorage({
      getItem: () => { throw new Error('nope'); },
      setItem: () => { throw new Error('nope'); },
      removeItem: () => { throw new Error('nope'); },
    });
    expect(store.loadIndex()).toEqual([]);
    expect(store.savePuzzle(createPuzzle({ rows: 3, cols: 3, style: 'barred', symmetry: 'none', template: 'empty' }))).toBe(false);
  });
});
