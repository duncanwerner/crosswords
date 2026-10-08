import { members } from './bitset';
import type { WordIndex } from './word-index';

/**
 * dictionary words matching a regular expression. matching is
 * case-insensitive and unanchored, as usual: "sten$" finds words ending in
 * STEN, "^re" words starting with RE.
 */

export interface RegexRequest {
  pattern: string;
  minLength: number;
  maxLength: number;
  limit: number;
}

export interface RegexResult {
  total: number;
  /** shortest first, then alphabetical */
  items: Array<{ word: string; flags: number }>;
}

export const compile = (pattern: string) => new RegExp(pattern, 'i');

export const regexSearch = (index: WordIndex, req: RegexRequest): RegexResult => {
  const rex = compile(req.pattern);
  const result: RegexResult = { total: 0, items: [] };
  const lengths = [...index.buckets.keys()]
    .filter(l => l >= req.minLength && l <= req.maxLength)
    .sort((a, b) => a - b);
  for (const length of lengths) {
    const bucket = index.buckets.get(length)!;
    for (const i of members(bucket.allowed)) {
      const word = bucket.words[i];
      if (!rex.test(word)) continue;
      result.total++;
      if (result.items.length < req.limit) result.items.push({ word, flags: bucket.flags[i] });
    }
  }
  return result;
};

/** "7" -> 7..7, "5-9" -> 5..9, "6+" -> 6.., "" -> any. undefined if unreadable */
export const parseLengths = (text: string): { min: number; max: number } | undefined => {
  const t = text.replace(/\s/g, '');
  if (!t) return { min: 1, max: Infinity };
  let m = /^(\d+)$/.exec(t);
  if (m) return { min: +m[1], max: +m[1] };
  m = /^(\d*)-(\d*)$/.exec(t);
  if (m && (m[1] || m[2])) return { min: m[1] ? +m[1] : 1, max: m[2] ? +m[2] : Infinity };
  m = /^(\d+)\+$/.exec(t);
  if (m) return { min: +m[1], max: Infinity };
  return undefined;
};
