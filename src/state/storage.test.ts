import { describe, expect, it } from 'vitest';
import { createPuzzle } from '../model/puzzle';
import { createStorage, migrate, parseBackup, serializeLibrary, summarize } from './storage';

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

  it('keeps links to lights that exist, and entries that only hold links', () => {
    const store = createStorage(memory());
    const p = createPuzzle({ rows: 5, cols: 5, style: 'blocked', symmetry: 'rotational', template: 'lattice' });
    p.clues['0,0,A'] = { text: '', enumeration: '', links: ['2,0,A', '1,1,A'] };
    p.clues['0,2,D'] = { text: '', enumeration: '', links: ['1,1,D'] };
    store.savePuzzle(p);
    expect(store.loadPuzzle(p.id)!.clues).toEqual({ '0,0,A': { text: '', enumeration: '', links: ['2,0,A'] } });
  });

  it('keeps explanations, and entries that only hold one', () => {
    const store = createStorage(memory());
    const p = createPuzzle({ rows: 5, cols: 5, style: 'blocked', symmetry: 'rotational', template: 'lattice' });
    p.clues['0,0,A'] = { text: 'Clue', enumeration: '', explanation: 'Anagram of …' };
    p.clues['0,0,D'] = { text: '', enumeration: '', explanation: 'Hidden' };
    p.clues['2,0,A'] = { text: 'Other', enumeration: '', explanation: '  ' };
    store.savePuzzle(p);
    expect(store.loadPuzzle(p.id)!.clues).toEqual({
      '0,0,A': { text: 'Clue', enumeration: '', explanation: 'Anagram of …' },
      '0,0,D': { text: '', enumeration: '', explanation: 'Hidden' },
      '2,0,A': { text: 'Other', enumeration: '' },
    });
  });

  it('keeps the template flag, and summarizes bars and templates', () => {
    const p = createPuzzle({ rows: 3, cols: 3, style: 'barred', symmetry: 'none', template: 'empty' });
    expect(migrate(p)!.template).toBeUndefined();
    expect(migrate({ ...p, template: 'yes' })!.template).toBeUndefined();
    p.template = true;
    p.cells[0].barRight = true;
    p.cells[1].barBottom = true;
    p.cells[2].barRight = p.cells[2].barBottom = true;
    p.cells[4].block = true;
    expect(migrate(p)!.template).toBe(true);
    expect(summarize(p)).toMatchObject({ template: true, complete: false, thumb: 'rb+.#....' });
  });

  it('round-trips a library backup, counting unreadable entries', () => {
    const a = createPuzzle({ rows: 5, cols: 5, style: 'blocked', symmetry: 'rotational', template: 'lattice' });
    const b = createPuzzle({ rows: 3, cols: 3, style: 'barred', symmetry: 'none', template: 'empty' });
    a.clues['0,0,A'] = { text: 'Clue', enumeration: '5' };
    a.clues['1,1,A'] = { text: 'Orphan', enumeration: '' };
    b.template = true;
    const back = parseBackup(JSON.parse(serializeLibrary([a, b])))!;
    expect(back.unreadable).toBe(0);
    expect(back.puzzles.map(p => p.id)).toEqual([a.id, b.id]);
    expect(back.puzzles[0].clues).toEqual({ '0,0,A': { text: 'Clue', enumeration: '5' } });
    expect(back.puzzles[1].template).toBe(true);

    const raw = JSON.parse(serializeLibrary([a]));
    raw.puzzles.push({ junk: true }, 7);
    expect(parseBackup(raw)).toMatchObject({ puzzles: [{ id: a.id }], unreadable: 2 });
    expect(parseBackup(a)).toBeUndefined();
    expect(parseBackup({ kind: 'cross-library' })).toBeUndefined();
  });

  it('repairs clue entries', () => {
    const p = migrate({ id: 'x', rows: 1, cols: 1, clues: {
      '0,0,A': { text: 'ok', links: ['0,1,D', 7, 'junk'] },
      '0,0,D': 'junk',
      'nope': { text: 'x' },
    } })!;
    expect(p.clues).toEqual({ '0,0,A': { text: 'ok', enumeration: '', links: ['0,1,D'] } });
  });

  it('repairs partial data and rejects junk', () => {
    const p = migrate({ id: 'x', rows: 2, cols: 2, cells: [{ block: true }, { letter: 'b' }] })!;
    expect(p.cells).toHaveLength(4);
    expect(p.cells[1].letter).toBe('B');
    expect(p.style).toBe('blocked');
    expect(p.blocked).toEqual([]);
    expect(migrate({ id: 'y', rows: 1, cols: 1, blocked: ['nit', 'ÉLS', 'nit', 3] })!.blocked).toEqual(['ELS', 'NIT']);
    expect(p.required).toEqual([]);
    expect(migrate({ id: 'y', rows: 1, cols: 1, required: ['trump', 'Obama', 'trump', 3] })!.required).toEqual(['OBAMA', 'TRUMP']);
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
