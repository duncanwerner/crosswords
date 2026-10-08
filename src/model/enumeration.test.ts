import { describe, expect, it } from 'vitest';
import { breaks, display, format, fromAnswer, parse, validate } from './enumeration';

describe('enumeration', () => {
  it('parses and formats', () => {
    for (const s of ['5', '3,4', '4-5', '2,3,2-4']) expect(format(parse(s)!)).toBe(s);
    expect(format(parse(' (3, 4) ')!)).toBe('3,4');
    expect(parse('3,,4')).toBeUndefined();
    expect(parse('abc')).toBeUndefined();
    expect(parse('0,3')).toBeUndefined();
  });

  it('validates against the light length', () => {
    expect(validate('', 7)).toBe('default');
    expect(validate('3,4', 7)).toBe('ok');
    expect(validate('3,3', 7)).toBe('mismatch');
    expect(validate('3,x', 7)).toBe('invalid');
  });

  it('displays the default as the length', () => {
    expect(display('', 9)).toBe('(9)');
    expect(display('4-5', 9)).toBe('(4-5)');
  });

  it('lists breaks after letter indexes', () => {
    expect(breaks('3,4')).toEqual([{ after: 2, type: ',' }]);
    expect(breaks('2,3,2-4')).toEqual([
      { after: 1, type: ',' }, { after: 4, type: ',' }, { after: 6, type: '-' },
    ]);
    expect(breaks('7')).toEqual([]);
  });

  it('derives letters and enumeration from an answer', () => {
    expect(fromAnswer('top hat')).toEqual({ letters: 'TOPHAT', enumeration: '3,3' });
    expect(fromAnswer('well-to-do')).toEqual({ letters: 'WELLTODO', enumeration: '4-2-2' });
    expect(fromAnswer("o'clock")).toEqual({ letters: 'OCLOCK', enumeration: '' });
    expect(fromAnswer('man-of-war  ship')).toEqual({ letters: 'MANOFWARSHIP', enumeration: '3-2-3,4' });
    expect(fromAnswer('café au lait')).toEqual({ letters: 'CAFEAULAIT', enumeration: '4,2,4' });
    expect(fromAnswer('smørrebrød')).toEqual({ letters: 'SMORREBROD', enumeration: '' });
    expect(fromAnswer('')).toEqual({ letters: '', enumeration: '' });
  });
});
