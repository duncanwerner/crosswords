import { describe, expect, it } from 'vitest';
import { type ClueRecord, sameSource, searchLog, toRecord } from './clue-log';

const rec = (word: string, clue: string, saved: number, extra: Partial<ClueRecord> = {}): ClueRecord => ({
  id: `${word}-${saved}`, word, enumeration: '', clue, puzzleId: 'p', puzzleTitle: 'P', light: '0,0,A', saved, ...extra,
});

const log = [
  rec('STOP', 'Halt pots, oddly', 1),
  rec('SHOP', 'Store', 2),
  rec('STOPMOTION', 'Animation technique', 3, { enumeration: '4,6' }),
  rec('STOP', 'Cease', 4, { light: '2,0,A' }),
];
const words = (list: ClueRecord[]) => list.map(r => `${r.word}:${r.clue}`);

describe('searchLog', () => {
  it('lists everything newest first with no query', () => {
    expect(searchLog(log, '  ').map(r => r.saved)).toEqual([4, 3, 2, 1]);
  });

  it('puts exact answers first, then answers containing the letters', () => {
    expect(words(searchLog(log, 'stop'))).toEqual(['STOP:Cease', 'STOP:Halt pots, oddly', 'STOPMOTION:Animation technique']);
    expect(words(searchLog(log, 'stop motion'))).toEqual(['STOPMOTION:Animation technique']);
  });

  it('matches patterns by length', () => {
    expect(words(searchLog(log, 's?op'))).toEqual(['STOP:Cease', 'SHOP:Store', 'STOP:Halt pots, oddly']);
    expect(searchLog(log, 'S...')).toHaveLength(3);
  });

  it('searches clue text', () => {
    expect(words(searchLog(log, 'technique'))).toEqual(['STOPMOTION:Animation technique']);
    expect(words(searchLog(log, 'pots, odd'))).toEqual(['STOP:Halt pots, oddly']);
  });
});

describe('sameSource', () => {
  it('matches the same light and answer in the same puzzle', () => {
    expect(sameSource(log[0], rec('STOP', 'Other wording', 9))).toBe(true);
    expect(sameSource(log[0], log[3])).toBe(false);
    expect(sameSource({ ...log[0], puzzleId: '' }, { ...log[0], puzzleId: '' })).toBe(false);
  });
});

describe('toRecord', () => {
  it('cleans imported records and rejects junk', () => {
    expect(toRecord({ id: 'a', word: 'café au lait', clue: ' Drink ', light: 'bad', saved: '5' }))
      .toEqual({ id: 'a', word: 'CAFEAULAIT', enumeration: '', clue: 'Drink', puzzleId: '', puzzleTitle: '', light: '', saved: 5 });
    expect(toRecord({ id: 'a', word: '123', clue: 'x' })).toBeUndefined();
    expect(toRecord({ word: 'A', clue: 'x' })).toBeUndefined();
    expect(toRecord('nope')).toBeUndefined();
  });
});
