import { describe, expect, it } from 'vitest';
import { searchEntries, searchPuzzles } from './search';
import { gridFrom } from './test-helpers';
import type { ClueEntry, LightKey } from './types';

// 1 . 2
// . # .
// 3 . .
const puzzle = (id: string, lines: string[], clues: Partial<Record<LightKey, ClueEntry>> = {}) => ({ id, title: id, ...gridFrom(lines), clues });

const clue = (text: string, extra: Partial<ClueEntry> = {}): ClueEntry => ({ text, enumeration: '', ...extra });

const indexed = (...puzzles: ReturnType<typeof puzzle>[]) => puzzles.map(p => ({ puzzle: p, entries: searchEntries(p) }));

describe('searchEntries', () => {
  it('lists answers with a clue or letters, skipping empty ones', () => {
    const p = puzzle('a', ['CAT', '.#.', '...'], { '0,2,D': clue(' Sharp turn ') });
    expect(searchEntries(p)).toEqual([
      { key: '0,0,A', ref: '1a', answer: 'CAT', enumeration: '(3)', clue: '' },
      { key: '0,0,D', ref: '1d', answer: 'C..', enumeration: '(3)', clue: '' },
      { key: '0,2,D', ref: '2d', answer: 'T..', enumeration: '(3)', clue: 'Sharp turn' },
    ]);
  });

  it('treats linked lights as one answer', () => {
    const p = puzzle('a', ['CAT', '.#.', 'DOG'], { '0,0,A': clue('Pets', { enumeration: '3,3', links: ['2,0,A'] }) });
    const linked = searchEntries(p).find(e => e.ref === '1a');
    expect(linked).toMatchObject({ answer: 'CATDOG', enumeration: '(3,3)', clue: 'Pets' });
    expect(searchEntries(p).some(e => e.ref === '3a')).toBe(false);
  });
});

describe('searchPuzzles', () => {
  const a = puzzle('a', ['CAT', '.#.', 'DOG'], { '0,0,A': clue('Feline pet'), '2,0,A': clue('Hound') });
  const b = puzzle('b', ['DOG', '.#.', 'CAT'], { '0,0,A': clue('Pet hound') });

  it('finds nothing for an empty query', () => {
    expect(searchPuzzles(indexed(a, b), '  ')).toEqual([]);
  });

  it('matches clue text, ignoring case', () => {
    expect(searchPuzzles(indexed(a, b), 'HOUND').map(h => `${h.puzzleId} ${h.ref}`)).toEqual(['a 3a', 'b 1a']);
  });

  it('matches answers by their letters, exact answers first', () => {
    expect(searchPuzzles(indexed(a, b), 'do g').map(h => `${h.puzzleId} ${h.ref} ${h.answer}`)).toEqual(['a 3a DOG', 'b 1a DOG']);
    expect(searchPuzzles(indexed(a, b), 'pet').map(h => `${h.puzzleId} ${h.ref}`)).toEqual(['a 1a', 'b 1a']);
  });

  it('matches patterns against whole answers', () => {
    expect(searchPuzzles(indexed(a, b), 'c?t').map(h => `${h.puzzleId} ${h.ref}`)).toEqual(['a 1a', 'b 3a']);
  });

  it('carries the puzzle title', () => {
    expect(searchPuzzles(indexed(a), 'feline')[0]).toMatchObject({ puzzleId: 'a', puzzleTitle: 'a', key: '0,0,A' });
  });
});
