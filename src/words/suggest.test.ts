import { describe, expect, it } from 'vitest';
import { suggest } from './suggest';
import { WordIndex } from './word-index';

const index = new WordIndex(['cat', 'cot', 'cut', 'tab', 'tub', 'tob', 'axe', 'ate', 'are']);

describe('suggest', () => {
  it('ranks by crossing options and sinks dead ends', () => {
    // light C.T; its middle cell is the first letter of a crossing ".?." light
    // crossing pattern '...' position 0: letter A starts AXE ATE ARE (3), U starts nothing, O nothing
    const r = suggest(index, {
      pattern: 'C.T',
      crossings: [{ index: 1, pattern: '...', position: 0 }],
      used: [],
      filter: '',
      limit: 10,
    });
    expect(r.total).toBe(3);
    expect(r.viable).toBe(1);
    expect(r.items.map(s => s.word)).toEqual(['CAT', 'COT', 'CUT']);
    expect(r.items[0].min).toBe(3);
    expect(r.items[1].min).toBe(0);
  });

  it('filters, marks used words and limits', () => {
    const r = suggest(index, { pattern: 'T.B', crossings: [], used: ['TAB'], filter: 'U', limit: 10 });
    expect(r.items.map(s => s.word)).toEqual(['TUB']);
    const all = suggest(index, { pattern: 'T.B', crossings: [], used: ['TAB'], filter: '', limit: 2 });
    expect(all.matched).toBe(3);
    expect(all.items.map(s => [s.word, s.used])).toEqual([['TOB', false], ['TUB', false]]);
  });
});
