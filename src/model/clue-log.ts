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
 * a search query, shared by the clue log and the library search. a pattern
 * with '.' or '?' for unknown letters ("S.OP") matches answers of that
 * length; other text matches answers containing its letters, or clues
 * containing it. `exact` is the answer it names, for ranking.
 */
export const clueMatcher = (query: string): { test: (word: string, clue: string) => boolean; exact: string } | undefined => {
  const q = query.trim();
  if (!q) return undefined;
  if (/^[a-z.?]+$/i.test(q) && /[.?]/.test(q)) {
    const re = new RegExp(`^${q.toUpperCase().replace(/\?/g, '.')}$`);
    return { test: word => re.test(word), exact: '' };
  }
  const letters = toLetters(q);
  const text = q.toLowerCase();
  return { test: (word, clue) => (!!letters && word.includes(letters)) || clue.toLowerCase().includes(text), exact: letters };
};

/** search the log (see clueMatcher); exact answers first, then newest */
export const searchLog = (records: readonly ClueRecord[], query: string): ClueRecord[] => {
  const m = clueMatcher(query);
  if (!m) return [...records].sort(byNewest);
  return records
    .filter(r => m.test(r.word, r.clue))
    .sort((a, b) => Number(b.word === m.exact) - Number(a.word === m.exact) || byNewest(a, b));
};
