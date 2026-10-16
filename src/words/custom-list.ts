import { fromAnswer } from '../model/enumeration';

/**
 * a word list of your own, from a text file with one entry per line.
 * entries are cleaned like the standard lists (diacritics folded, non-letters
 * dropped, uppercased); phrases like "man-of-war" also keep their
 * enumeration, so choosing one can set the clue's.
 */
export interface CustomList {
  name: string;
  /** uppercase A-Z, distinct, sorted */
  words: string[];
  /** enumerations for the phrases among them, e.g. MANOFWAR -> "3-2-3" */
  enumerations: Record<string, string>;
  /** non-blank lines with no letters */
  skipped: number;
  /** lines that repeated an earlier word */
  duplicates: number;
}

export const parseCustomList = (name: string, text: string): CustomList => {
  const words = new Set<string>();
  const enumerations: Record<string, string> = {};
  let skipped = 0;
  let duplicates = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const { letters, enumeration } = fromAnswer(line);
    if (!letters) {
      skipped++;
      continue;
    }
    if (words.has(letters)) {
      duplicates++;
      continue;
    }
    words.add(letters);
    if (enumeration) enumerations[letters] = enumeration;
  }
  return { name, words: [...words].sort(), enumerations, skipped, duplicates };
};
