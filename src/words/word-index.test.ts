import { describe, expect, it } from 'vitest';
import { count, full, members } from './bitset';
import { FLAG_ABBREVIATION, FLAG_PROPER, WordIndex } from './word-index';

const RAW = ['cat', 'cot', 'cut', 'act', 'Bill', 'bill', 'Paris', 'AOL', 'dog', 'smørrebrød', 'ox'];

const matches = (index: WordIndex, pattern: string) => {
  const m = index.match(pattern);
  return m ? [...index.words(m.bucket, m.set)].map(w => w.word) : [];
};

describe('bitset', () => {
  it('masks the tail of a full set and iterates members', () => {
    const b = full(37);
    expect(count(b)).toBe(37);
    expect([...members(b)].slice(-2)).toEqual([35, 36]);
  });
});

describe('WordIndex', () => {
  it('matches patterns on uppercase ascii', () => {
    const index = new WordIndex(RAW);
    expect(matches(index, 'C.T')).toEqual(['CAT', 'COT', 'CUT']);
    expect(matches(index, '..T')).toEqual(['ACT', 'CAT', 'COT', 'CUT']);
    expect(matches(index, 'SMORREBROD')).toEqual(['SMORREBROD']);
    expect(matches(index, '.......')).toEqual([]);
    expect(index.count('XYZ')).toBe(0);
  });

  it('excludes proper nouns and abbreviations unless asked', () => {
    const index = new WordIndex(RAW);
    expect(matches(index, '.....')).toEqual([]);
    expect(matches(index, '...')).not.toContain('AOL');
    // Bill/bill merge into a common word
    expect(matches(index, 'B...')).toEqual(['BILL']);
    index.setOptions({ proper: true });
    expect(matches(index, '.....')).toEqual(['PARIS']);
    const m = index.match('...')!;
    const aol = [...index.words(m.bucket, m.set)].find(w => w.word === 'AOL');
    expect(aol?.flags).toBe(FLAG_ABBREVIATION);
    const p = index.match('PARIS')!;
    expect([...index.words(p.bucket, p.set)][0].flags).toBe(FLAG_PROPER);
  });

  it('counts letters per position', () => {
    const index = new WordIndex(RAW);
    const counts = index.letterCounts('C.T', 1);
    expect(counts['A'.charCodeAt(0) - 65]).toBe(1);
    expect(counts['O'.charCodeAt(0) - 65]).toBe(1);
    expect(counts['E'.charCodeAt(0) - 65]).toBe(0);
  });

  it('leaves blocked words out of every query, including counts', () => {
    const index = new WordIndex(RAW);
    index.setBlocked(['COT', 'NOTAWORD']);
    expect(matches(index, 'C.T')).toEqual(['CAT', 'CUT']);
    expect(index.letterCounts('C.T', 1)['O'.charCodeAt(0) - 65]).toBe(0);
    // survives an options change, and can be lifted
    index.setOptions({ proper: true });
    expect(matches(index, 'C.T')).toEqual(['CAT', 'CUT']);
    index.setBlocked([]);
    expect(matches(index, 'C.T')).toEqual(['CAT', 'COT', 'CUT']);
  });
});
