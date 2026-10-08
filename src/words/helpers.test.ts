import { describe, expect, it } from 'vitest';
import { anagrams } from './anagrams';
import { parseLengths, regexSearch } from './regex';
import { WordIndex } from './word-index';

const index = new WordIndex([
  'listen', 'silent', 'enlist', 'tinsel', 'inlets', 'list', 'ten', 'net', 'lit', 'lent', 'is', 'sin', 'nil', 'set',
  'glisten', 'Boston', 'piston', 'a', 'i',
]);

const phrases = (letters: string, maxWords = 3, minLength = 2) =>
  anagrams(index, { letters, maxWords, minLength, limit: 100 }).items.map(a => a.parts.map(p => p.join('/')).join(' '));

describe('anagrams', () => {
  it('groups single-word anagrams and leaves out the input itself', () => {
    expect(phrases('LISTEN', 1)).toEqual(['ENLIST/INLETS/SILENT/TINSEL']);
  });

  it('finds phrases, fewest words first, longest part first, no permutations', () => {
    const list = phrases('LISTEN', 2);
    expect(list[0]).toBe('ENLIST/INLETS/SILENT/TINSEL');
    expect(list).toContain('LENT IS');
    expect(list).toContain('SET NIL');
    expect(list).not.toContain('NIL SET');
    expect(list).toHaveLength(3);
  });

  it('respects the minimum word length', () => {
    expect(phrases('LISTEN', 2, 3)).not.toContain('LENT IS');
  });

  it('stops at the limit and says so', () => {
    const r = anagrams(index, { letters: 'LISTEN', maxWords: 3, minLength: 2, limit: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it('returns nothing for letters with no anagram', () => {
    expect(phrases('QQQ')).toEqual([]);
  });
});

describe('regex', () => {
  it('matches case-insensitively, unanchored unless anchored', () => {
    const r = regexSearch(index, { pattern: 'sten$', minLength: 1, maxLength: Infinity, limit: 10 });
    expect(r.items.map(i => i.word)).toEqual(['LISTEN', 'GLISTEN']);
    // LIST LISTEN ENLIST PISTON GLISTEN
    expect(regexSearch(index, { pattern: 'IST', minLength: 1, maxLength: Infinity, limit: 10 }).total).toBe(5);
  });

  it('filters by length and limits', () => {
    const r = regexSearch(index, { pattern: '^.i', minLength: 4, maxLength: 6, limit: 2 });
    expect(r.total).toBe(5); // LIST LISTEN PISTON SILENT TINSEL
    expect(r.items.map(i => i.word)).toEqual(['LIST', 'LISTEN']);
  });

  it('parses length filters', () => {
    expect(parseLengths('')).toEqual({ min: 1, max: Infinity });
    expect(parseLengths('7')).toEqual({ min: 7, max: 7 });
    expect(parseLengths('5-9')).toEqual({ min: 5, max: 9 });
    expect(parseLengths('6+')).toEqual({ min: 6, max: Infinity });
    expect(parseLengths('-4')).toEqual({ min: 1, max: 4 });
    expect(parseLengths('x')).toBeUndefined();
  });

  it('compares a plain length by the chosen operator', () => {
    expect(parseLengths('7', '=')).toEqual({ min: 7, max: 7 });
    expect(parseLengths('7', '>=')).toEqual({ min: 7, max: Infinity });
    expect(parseLengths('7', '<=')).toEqual({ min: 1, max: 7 });
    // ranges and blanks ignore it
    expect(parseLengths('5-9', '<=')).toEqual({ min: 5, max: 9 });
    expect(parseLengths('', '>=')).toEqual({ min: 1, max: Infinity });
  });
});
