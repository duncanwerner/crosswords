import { clueMatcher } from './clue-log';
import { entryPattern, entryRef } from './describe';
import { display } from './enumeration';
import { computeLights } from './lights';
import { type LinkMap, computeEntries } from './links';
import type { LightKey, Puzzle } from './types';

/**
 * library search: every answer and clue in every puzzle, matched with the
 * clue log's rules (see clueMatcher).
 */

export type SearchablePuzzle = Pick<Puzzle, 'id' | 'title' | 'rows' | 'cols' | 'cells' | 'clues'>;

export interface SearchEntry {
  /** the head light, to open the puzzle at */
  key: LightKey;
  /** "5a", from the head light */
  ref: string;
  /** letters so far, '.' for an empty square */
  answer: string;
  /** "(3,4)" */
  enumeration: string;
  clue: string;
}

export interface SearchHit extends SearchEntry {
  puzzleId: string;
  puzzleTitle: string;
}

/** a puzzle's answers that have a clue or any letters, in light order */
export const searchEntries = (puzzle: SearchablePuzzle): SearchEntry[] => {
  const map = computeLights(puzzle);
  const links: LinkMap = {};
  for (const light of map.lights) {
    const keys = puzzle.clues[light.key]?.links;
    if (keys?.length) links[light.key] = keys;
  }
  return computeEntries(map, links).list.flatMap(entry => {
    const clue = puzzle.clues[entry.key];
    const answer = entryPattern(puzzle.cells, entry);
    const text = clue?.text.trim() ?? '';
    if (!text && !/[A-Z]/.test(answer)) return [];
    return [{ key: entry.key, ref: entryRef(entry), answer, enumeration: display(clue?.enumeration ?? '', entry.cells.length), clue: text }];
  });
};

/**
 * search answers and clues across puzzles, which come with their entries
 * (so a caller can cache them). exact answers first, then in the order given.
 */
export const searchPuzzles = (puzzles: readonly { puzzle: Pick<Puzzle, 'id' | 'title'>; entries: readonly SearchEntry[] }[], query: string): SearchHit[] => {
  const m = clueMatcher(query);
  if (!m) return [];
  const hits = puzzles.flatMap(({ puzzle, entries }) =>
    entries.filter(e => m.test(e.answer, e.clue)).map(e => ({ ...e, puzzleId: puzzle.id, puzzleTitle: puzzle.title })),
  );
  return hits.sort((a, b) => Number(b.answer === m.exact) - Number(a.answer === m.exact));
};
