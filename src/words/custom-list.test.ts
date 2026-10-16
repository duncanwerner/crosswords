import { describe, expect, it } from 'vitest';
import { gridFrom } from '../model/test-helpers';
import { anagrams } from './anagrams';
import { parseCustomList } from './custom-list';
import { Filler } from './fill';
import { regexSearch } from './regex';
import { suggest } from './suggest';
import { FLAG_MINE, type MineMode, WordIndex } from './word-index';

const matches = (index: WordIndex, pattern: string) => {
  const m = index.match(pattern);
  return m ? [...index.words(m.bucket, m.set)].map(w => w.word) : [];
};

describe('parseCustomList', () => {
  it('cleans entries, keeps phrase enumerations and counts what it skipped', () => {
    const list = parseCustomList('mine.txt', 'man-of-war\r\nÎle de France\n\n  cat \nCAT\n123\nsmørrebrød\nit\'s\n');
    expect(list.words).toEqual(['CAT', 'ILEDEFRANCE', 'ITS', 'MANOFWAR', 'SMORREBROD']);
    expect(list.enumerations).toEqual({ MANOFWAR: '3-2-3', ILEDEFRANCE: '3,2,6' });
    expect(list.skipped).toBe(1);
    expect(list.duplicates).toBe(1);
  });
});

describe('your own words in the index', () => {
  const RAW = ['cat', 'cot', 'cut', 'Paris', 'AOL'];

  it('adds them as common words, whatever their dictionary flags', () => {
    const index = new WordIndex(RAW, {}, ['PARIS', 'ZAP']);
    expect(index.mineCount).toBe(2);
    expect(matches(index, '.....')).toEqual(['PARIS']);
    expect(index.flagsOf('PARIS')).toBe(FLAG_MINE);
    expect(index.flagsOf('CAT')).toBe(0);
    expect(index.flagsOf('NOPE')).toBeUndefined();
  });

  it('can be limited to them', () => {
    const index = new WordIndex(RAW, { mine: 'only', proper: true }, ['CUT', 'ZAP']);
    expect(matches(index, '...')).toEqual(['CUT', 'ZAP']);
    expect(index.mineOnly).toBe(true);
    index.setBlocked(['ZAP']);
    expect(matches(index, '...')).toEqual(['CUT']);
    index.setOptions({ mine: 'mixed' });
    expect(matches(index, '...')).toEqual(['AOL', 'CAT', 'COT', 'CUT']);
  });

  it('means nothing without a list', () => {
    const index = new WordIndex(RAW, { mine: 'only' });
    expect(index.mineOnly).toBe(false);
    expect(matches(index, 'C.T')).toEqual(['CAT', 'COT', 'CUT']);
  });
});

describe('preferring your own words', () => {
  const RAW = ['cat', 'cot', 'cut', 'tab', 'tub', 'axe', 'ate', 'are', 'oaf'];

  it('puts them first in suggestions, after dead ends and used words sink', () => {
    const index = new WordIndex(RAW, { mine: 'first' }, ['CUT', 'TUB']);
    const r = suggest(index, { pattern: '...', crossings: [], used: ['TUB'], filter: '', limit: 20 });
    expect(r.items.slice(0, 1).map(s => s.word)).toEqual(['CUT']);
    expect(r.items.at(-1)?.word).toBe('TUB');
    // CUT is yours but leaves the crossing (U..) with nothing, so it sinks
    const crossed = suggest(index, { pattern: 'C.T', crossings: [{ index: 1, pattern: '...', position: 0 }], used: [], filter: '', limit: 10 });
    expect(crossed.items.map(s => s.word)).toEqual(['CAT', 'COT', 'CUT']);
    index.setOptions({ mine: 'mixed' });
    expect(suggest(index, { pattern: 'C.T', crossings: [], used: [], filter: '', limit: 10 }).items.map(s => s.word)).toEqual(['CAT', 'COT', 'CUT']);
  });

  it('puts them first in regex results, past the limit, within each length', () => {
    const index = new WordIndex(RAW, { mine: 'first' }, ['TUB', 'CATS']);
    const r = regexSearch(index, { pattern: '^[ct]', minLength: 1, maxLength: 9, limit: 3 });
    expect(r.items.map(i => i.word)).toEqual(['TUB', 'CAT', 'CATS']);
    expect(r.total).toBe(6);
  });

  it('marks them in anagrams and puts them first', () => {
    const index = new WordIndex(['listen', 'silent', 'enlist', 'lent', 'is'], { mine: 'first' }, ['TINSEL']);
    const r = anagrams(index, { letters: 'LISTEN', maxWords: 2, minLength: 2, limit: 10 });
    expect(r.mine).toEqual(['TINSEL']);
    expect(r.items[0].parts[0][0]).toBe('TINSEL');
  });

  const fill = (mode: MineMode, mine: string[], lines: string[], seed: number) => {
    const grid = gridFrom(lines);
    const index = new WordIndex(RAW, { mine: mode }, mine);
    const filler = new Filler(index, { rows: grid.rows, cols: grid.cols, shape: grid.cells, letters: '.'.repeat(lines.length * lines[0].length), seed });
    let state: ReturnType<Filler['run']> = 'running';
    for (let i = 0; i < 1000 && state === 'running'; i++) state = filler.run(100);
    return filler.result(state === 'running' ? 'partial' : state, 0);
  };

  it('fills with them whenever they fit, and counts them', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = fill('first', ['OAF'], ['...'], seed);
      expect(r.letters).toBe('OAF');
      expect(r.mine).toBe(1);
    }
    const mixed = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seed => fill('mixed', ['OAF'], ['...'], seed).letters));
    expect(mixed.size).toBeGreaterThan(1);
  });

  it("says when your words alone can't fill the grid", () => {
    const r = fill('only', ['OAF'], ['...', '...', '...'], 1);
    expect(r.status).toBe('impossible');
    expect(r.message).toMatch(/only your own words/);
  });
});
