import type { AnagramRequest } from './anagrams';
import type { RegexRequest } from './regex';
import type { IndexOptions } from './word-index';

export type Dictionary = 'base' | 'large' | 'insane';

export interface Crossing {
  /** index of the shared cell within the light being suggested for */
  index: number;
  /** the crossing light's current pattern, '.' for empty cells */
  pattern: string;
  /** index of the shared cell within the crossing light */
  position: number;
}

export interface SuggestRequest {
  pattern: string;
  /** crossings at empty cells only */
  crossings: Crossing[];
  /** words already in the grid (marked, not removed) */
  used: string[];
  /** uppercase substring filter */
  filter: string;
  limit: number;
}

export interface Suggestion {
  word: string;
  flags: number;
  /** the fewest options this word leaves any crossing light (Infinity if no crossings) */
  min: number;
  /** sum of log2(options + 1) across crossings: higher keeps the grid more open */
  score: number;
  used: boolean;
}

export interface SuggestResult {
  /** all matches for the pattern */
  total: number;
  /** matches after the filter */
  matched: number;
  /** filtered matches that leave every crossing at least one option */
  viable: number;
  items: Suggestion[];
}

export interface LoadResult {
  dictionary: Dictionary;
  words: number;
}

export type Request =
  | { id: number; type: 'load'; url: string; dictionary: Dictionary; options: IndexOptions }
  | ({ id: number; type: 'suggest' } & SuggestRequest)
  | ({ id: number; type: 'anagrams' } & AnagramRequest)
  | ({ id: number; type: 'regex' } & RegexRequest);

export type Response =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };
