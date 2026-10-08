import { describe, expect, it } from 'vitest';
import { toAscii, toLetters } from './ascii';

describe('ascii folding', () => {
  it('removes diacritics', () => {
    expect(toAscii('café crème naïve Ångström')).toBe('cafe creme naive Angstrom');
  });
  it('replaces letters that do not decompose', () => {
    expect(toAscii('smørrebrød')).toBe('smorrebrod');
    expect(toAscii('Tromsø')).toBe('Tromso');
    expect(toAscii('Æsop œuvre straße Łódź')).toBe('AEsop oeuvre strasse Lodz');
  });
  it('drops anything else non-ascii', () => {
    expect(toAscii('a’b☃c')).toBe('abc');
  });
  it('produces grid letters', () => {
    expect(toLetters("o'clock")).toBe('OCLOCK');
    expect(toLetters('Smørbrød')).toBe('SMORBROD');
  });
});
