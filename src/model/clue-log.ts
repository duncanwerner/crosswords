import { toLetters } from './ascii';
import type { LightKey } from './types';

/**
 * the clue log: clues you've saved, by answer, across every puzzle, so you
 * can see whether you've clued a word before.
 */
export interface ClueRecord {
  id: string;
  /** the answer, uppercase A-Z */
  word: string;
  /** the answer's enumeration, e.g. "4,6"; '' for a single word */
  enumeration: string;
  clue: string;
  /** where it was written; a re-save from the same light replaces the record */
  puzzleId: string;
  puzzleTitle: string;
  light: LightKey | '';
  saved: number;
}

/** the record a new save replaces, if any: same puzzle, same light, same answer */
export const sameSource = (a: Pick<ClueRecord, 'puzzleId' | 'light' | 'word'>, b: Pick<ClueRecord, 'puzzleId' | 'light' | 'word'>) =>
  !!a.puzzleId && a.puzzleId === b.puzzleId && a.light === b.light && a.word === b.word;

/** newest first */
export const byNewest = (a: ClueRecord, b: ClueRecord) => b.saved - a.saved;

/** a record from untrusted data (an imported file), or undefined */
export const toRecord = (raw: unknown): ClueRecord | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<ClueRecord>;
  const word = typeof r.word === 'string' ? toLetters(r.word) : '';
  const clue = typeof r.clue === 'string' ? r.clue.trim() : '';
  if (!word || !clue || typeof r.id !== 'string' || !r.id) return undefined;
  return {
    id: r.id,
    word,
    enumeration: typeof r.enumeration === 'string' ? r.enumeration : '',
    clue,
    puzzleId: typeof r.puzzleId === 'string' ? r.puzzleId : '',
    puzzleTitle: typeof r.puzzleTitle === 'string' ? r.puzzleTitle : '',
    light: typeof r.light === 'string' && /^\d+,\d+,[AD]$/.test(r.light) ? (r.light as LightKey) : '',
    saved: Number(r.saved) || 0,
  };
};

/**
 * search the log. a pattern with '.' or '?' for unknown letters ("S.OP")
 * matches answers of that length; other text matches answers containing
 * its letters, or clues containing it.
 */
export const searchLog = (records: readonly ClueRecord[], query: string): ClueRecord[] => {
  const q = query.trim();
  if (!q) return [...records].sort(byNewest);
  if (/^[a-z.?]+$/i.test(q) && /[.?]/.test(q)) {
    const re = new RegExp(`^${q.toUpperCase().replace(/\?/g, '.')}$`);
    return records.filter(r => re.test(r.word)).sort(byNewest);
  }
  const letters = toLetters(q);
  const text = q.toLowerCase();
  return records
    .filter(r => (letters && r.word.includes(letters)) || r.clue.toLowerCase().includes(text))
    .sort((a, b) => Number(b.word === letters) - Number(a.word === letters) || byNewest(a, b));
};
