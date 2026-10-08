/**
 * fold text to plain US ASCII. diacritics are removed (é -> e), and letters
 * that don't decompose under NFD get explicit replacements (ø -> o, æ -> ae).
 * case is preserved; callers uppercase and strip non-letters as needed.
 */

const SPECIAL: Record<string, string> = {
  ø: 'o', Ø: 'O',
  æ: 'ae', Æ: 'AE',
  œ: 'oe', Œ: 'OE',
  ß: 'ss', ẞ: 'SS',
  ł: 'l', Ł: 'L',
  đ: 'd', Đ: 'D',
  ð: 'd', Ð: 'D',
  þ: 'th', Þ: 'TH',
  ı: 'i',
  ŋ: 'ng', Ŋ: 'NG',
};

export const toAscii = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x00-\x7f]/g, ch => SPECIAL[ch] ?? '');

/** uppercase A-Z only: the form used for grid letters and dictionary matching */
export const toLetters = (text: string) => toAscii(text).toUpperCase().replace(/[^A-Z]/g, '');
