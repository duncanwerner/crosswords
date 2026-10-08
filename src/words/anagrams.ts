import { members } from './bitset';
import type { WordIndex } from './word-index';

/**
 * anagrams of a set of letters, as one word or a phrase of several.
 * words with the same letters are grouped, so "LISTEN" gives one result
 * with alternatives [SILENT, ENLIST, TINSEL, INLETS] rather than four.
 */

export interface AnagramRequest {
  /** uppercase A-Z */
  letters: string;
  maxWords: number;
  minLength: number;
  /** max phrases (letter-group combinations) to return */
  limit: number;
  /** stop searching after this long, returning what was found */
  budgetMs?: number;
}

export interface Anagram {
  /** each part lists the interchangeable words with the same letters, longest part first */
  parts: string[][];
}

export interface AnagramResult {
  letters: string;
  items: Anagram[];
  /** true if the limit or time budget cut the search short */
  truncated: boolean;
}

const A = 65;

interface Group {
  sig: string;
  codes: Uint8Array;
  words: string[];
}

const signature = (word: string) => word.split('').sort().join('');

export const anagrams = (index: WordIndex, req: AnagramRequest): AnagramResult => {
  const letters = req.letters;
  const n = letters.length;
  const result: AnagramResult = { letters, items: [], truncated: false };
  if (!n) return result;

  const target = new Int16Array(26);
  for (let i = 0; i < n; i++) target[letters.charCodeAt(i) - A]++;

  // every allowed word that fits inside the letters, grouped by signature
  const bySig = new Map<string, Group>();
  const scratch = new Int16Array(26);
  for (const bucket of index.buckets.values()) {
    if (bucket.length > n || bucket.length < req.minLength) continue;
    for (const i of members(bucket.allowed)) {
      const word = bucket.words[i];
      scratch.set(target);
      let fits = true;
      for (let j = 0; j < word.length; j++) {
        if (--scratch[word.charCodeAt(j) - A] < 0) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      const sig = signature(word);
      const group = bySig.get(sig);
      if (group) group.words.push(word);
      else {
        const codes = new Uint8Array(word.length);
        for (let j = 0; j < word.length; j++) codes[j] = sig.charCodeAt(j) - A;
        bySig.set(sig, { sig, codes, words: [word] });
      }
    }
  }

  // longest first; combinations only ever step forward through this list,
  // so each set of groups is found once, in longest-first order
  const groups = [...bySig.values()].sort((a, b) => b.codes.length - a.codes.length || (a.sig < b.sig ? -1 : 1));
  const position = new Map(groups.map((g, i) => [g.sig, i]));

  const deadline = performance.now() + (req.budgetMs ?? 2000);
  const remaining = target.slice();
  const combo: Group[] = [];
  let steps = 0;

  const remainderSig = () => {
    let s = '';
    for (let c = 0; c < 26; c++) if (remaining[c]) s += String.fromCharCode(A + c).repeat(remaining[c]);
    return s;
  };

  const take = (g: Group) => {
    for (const c of g.codes) {
      if (--remaining[c] < 0) {
        for (const d of g.codes) {
          remaining[d]++;
          if (d === c) break;
        }
        return false;
      }
    }
    return true;
  };
  const give = (g: Group) => {
    for (const c of g.codes) remaining[c]++;
  };

  const emit = (parts: Group[]) => {
    result.items.push({ parts: parts.map(g => g.words) });
    if (result.items.length >= req.limit) result.truncated = true;
  };

  /** find phrases of exactly k words, all groups at or after `start` */
  const search = (k: number, start: number, left: number): boolean => {
    if (result.truncated) return false;
    if (++steps % 4096 === 0 && performance.now() > deadline) {
      result.truncated = true;
      return false;
    }
    if (k === 1) {
      // the last word must use exactly what's left: one lookup, no loop
      if (left < req.minLength) return true;
      const i = position.get(remainderSig());
      if (i !== undefined && i >= start) emit([...combo, groups[i]]);
      return true;
    }
    for (let i = start; i < groups.length; i++) {
      const g = groups[i];
      // the remaining k-1 words are each no longer than this one, and at least minLength
      if (g.codes.length * k < left) break;
      if (left - g.codes.length < (k - 1) * req.minLength) continue;
      if (!take(g)) continue;
      combo.push(g);
      const go = search(k - 1, i, left - g.codes.length);
      combo.pop();
      give(g);
      if (!go) return false;
    }
    return true;
  };

  for (let k = 1; k <= req.maxWords && !result.truncated; k++) search(k, 0, n);

  // the input itself isn't an anagram of itself
  result.items = result.items
    .map(a => (a.parts.length === 1 ? { parts: [a.parts[0].filter(w => w !== letters)] } : a))
    .filter(a => a.parts[0].length);

  return result;
};
