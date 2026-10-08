import { toAscii } from './ascii';

/**
 * cryptic enumerations: "5", "3,4", "4-5", "2,3,2-4". commas separate
 * words, hyphens separate parts of a hyphenated word. we accept spaces
 * and stray parentheses in input and normalize them away.
 */

export type Separator = ',' | '-';

export interface Enumeration {
  parts: number[];
  /** separators[i] sits between parts[i] and parts[i+1] */
  separators: Separator[];
}

export const normalize = (text: string) => text.replace(/[()\s]/g, '').replace(/\./g, ',');

export const parse = (text: string): Enumeration | undefined => {
  const clean = normalize(text);
  if (!clean) return undefined;
  if (!/^\d+([,-]\d+)*$/.test(clean)) return undefined;
  const parts = clean.split(/[,-]/).map(Number);
  if (parts.some(p => p < 1)) return undefined;
  const separators = (clean.match(/[,-]/g) || []) as Separator[];
  return { parts, separators };
};

export const format = (e: Enumeration) =>
  e.parts.map((p, i) => (i ? e.separators[i - 1] : '') + p).join('');

export const total = (e: Enumeration) => e.parts.reduce((a, b) => a + b, 0);

/** the enumeration to show for a light: the stored one, or the length */
export const display = (text: string, length: number) => `(${normalize(text) || length})`;

export type Validity = 'default' | 'ok' | 'invalid' | 'mismatch';

export const validate = (text: string, length: number): Validity => {
  if (!normalize(text)) return 'default';
  const e = parse(text);
  if (!e) return 'invalid';
  return total(e) === length ? 'ok' : 'mismatch';
};

/**
 * word breaks inside a light, for drawing in the grid. `after` is the index
 * of the letter the break follows.
 */
export const breaks = (text: string): Array<{ after: number; type: Separator }> => {
  const e = parse(text);
  if (!e) return [];
  const list: Array<{ after: number; type: Separator }> = [];
  let pos = 0;
  for (let i = 0; i < e.separators.length; i++) {
    pos += e.parts[i];
    list.push({ after: pos - 1, type: e.separators[i] });
  }
  return list;
};

/**
 * "top hat" -> { letters: "TOPHAT", enumeration: "3,3" }. single words give
 * an empty enumeration (i.e. the default). apostrophes are dropped and
 * accented letters folded to ascii.
 */
export const fromAnswer = (answer: string): { letters: string; enumeration: string } => {
  const words = toAscii(answer)
    .toUpperCase()
    .replace(/['’]/g, '')
    .trim()
    .split(/([\s,]+|-)/)
    .filter(w => w && !/^[\s,]+$/.test(w) || w === '-');

  const parts: number[] = [];
  const separators: Separator[] = [];
  let letters = '';
  let pending: Separator = ',';

  for (const w of words) {
    if (w === '-') {
      pending = '-';
      continue;
    }
    const clean = w.replace(/[^A-Z]/g, '');
    if (!clean) continue;
    if (parts.length) separators.push(pending);
    parts.push(clean.length);
    letters += clean;
    pending = ',';
  }

  return { letters, enumeration: parts.length > 1 ? format({ parts, separators }) : '' };
};
