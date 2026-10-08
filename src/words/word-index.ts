import { toAscii } from '../model/ascii';
import { type Bitset, andInto, clear, count, countAnd, full, members, set, words32 } from './bitset';

/**
 * a dictionary indexed for pattern matching. words are grouped by length;
 * within a length, each (position, letter) pair has a bitset of the words
 * with that letter there. matching a pattern is an AND of a few bitsets and
 * counting matches is a popcount, which is what makes suggestions instant
 * and gives the auto-filler cheap constraint checks.
 *
 * all matching is on uppercase ASCII A-Z.
 */

export const FLAG_PROPER = 1;
export const FLAG_ABBREVIATION = 2;

export interface IndexOptions {
  /** include proper nouns and abbreviations */
  proper: boolean;
}

export interface Bucket {
  length: number;
  words: string[];
  flags: Uint8Array;
  /** bitset size in 32-bit words */
  size: number;
  /** masks for (position, letter) at offset (p * 26 + c) * size */
  masks: Uint32Array;
  /** words allowed by the current options */
  base: Bitset;
  /** base, less blocked words: what every query uses */
  allowed: Bitset;
}

const A = 65;

/** binary search in a sorted list */
const indexOf = (list: readonly string[], word: string) => {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid] === word) return mid;
    if (list[mid] < word) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
};

export class WordIndex {
  readonly buckets = new Map<number, Bucket>();
  protected options: IndexOptions = { proper: false };
  protected blocked: string[] = [];
  protected blockedKey = '';

  /** raw dictionary words, any case; case decides proper noun / abbreviation */
  constructor(raw: readonly string[], options?: Partial<IndexOptions>) {
    // merge variants: BILL is common if any variant ("bill") is lowercase
    const merged = new Map<string, number>();
    for (const word of raw) {
      const ascii = toAscii(word).replace(/[^A-Za-z]/g, '');
      if (!ascii) continue;
      const upper = ascii.toUpperCase();
      let flags = 0;
      if (ascii.length > 1 && ascii === upper) flags |= FLAG_ABBREVIATION;
      else if (/^[A-Z]/.test(ascii)) flags |= FLAG_PROPER;
      const prev = merged.get(upper);
      merged.set(upper, prev === undefined ? flags : prev & flags);
    }

    const byLength = new Map<number, string[]>();
    for (const word of merged.keys()) {
      const list = byLength.get(word.length) ?? [];
      list.push(word);
      byLength.set(word.length, list);
    }

    for (const [length, words] of byLength) {
      words.sort();
      const size = words32(words.length);
      const masks = new Uint32Array(length * 26 * size);
      const flags = new Uint8Array(words.length);
      words.forEach((word, i) => {
        flags[i] = merged.get(word)!;
        for (let p = 0; p < length; p++) {
          const offset = (p * 26 + word.charCodeAt(p) - A) * size;
          masks[offset + (i >>> 5)] |= 1 << (i & 31);
        }
      });
      const all = full(words.length);
      this.buckets.set(length, { length, words, flags, size, masks, base: all, allowed: all });
    }

    this.setOptions(options ?? {});
  }

  setOptions(options: Partial<IndexOptions>) {
    this.options = { ...this.options, ...options };
    for (const bucket of this.buckets.values()) {
      const allowed = new Uint32Array(bucket.size);
      bucket.flags.forEach((flags, i) => {
        if (this.options.proper || !flags) set(allowed, i);
      });
      bucket.base = allowed;
    }
    this.applyBlocked();
  }

  /**
   * words to leave out of every query (uppercase A-Z). cheap to call
   * repeatedly with the same list.
   */
  setBlocked(words: readonly string[]) {
    const key = words.join(',');
    if (key === this.blockedKey) return;
    this.blockedKey = key;
    this.blocked = [...words];
    this.applyBlocked();
  }

  protected applyBlocked() {
    for (const bucket of this.buckets.values()) bucket.allowed = bucket.base;
    for (const word of this.blocked) {
      const bucket = this.buckets.get(word.length);
      if (!bucket) continue;
      const i = indexOf(bucket.words, word);
      if (i < 0) continue;
      if (bucket.allowed === bucket.base) bucket.allowed = bucket.base.slice();
      clear(bucket.allowed, i);
    }
  }

  /** the mask for a letter (0-25) at a position */
  mask(bucket: Bucket, position: number, letter: number): Bitset {
    const offset = (position * 26 + letter) * bucket.size;
    return bucket.masks.subarray(offset, offset + bucket.size);
  }

  /**
   * words matching a pattern: A-Z fixed, anything else ('.', '?', ' ') open.
   * returns undefined if there are no words of that length.
   */
  match(pattern: string): { bucket: Bucket; set: Bitset } | undefined {
    const bucket = this.buckets.get(pattern.length);
    if (!bucket) return undefined;
    const result = bucket.allowed.slice();
    for (let p = 0; p < pattern.length; p++) {
      const c = pattern.charCodeAt(p) - A;
      if (c >= 0 && c < 26) andInto(result, this.mask(bucket, p, c));
    }
    return { bucket, set: result };
  }

  count(pattern: string) {
    const m = this.match(pattern);
    return m ? count(m.set) : 0;
  }

  /**
   * for one open position of a pattern: how many matches have each letter
   * there. counts[c] === 0 means letter c can't go in that cell.
   */
  letterCounts(pattern: string, position: number): Uint32Array {
    const counts = new Uint32Array(26);
    const m = this.match(pattern);
    if (!m) return counts;
    for (let c = 0; c < 26; c++) counts[c] = countAnd(m.set, this.mask(m.bucket, position, c));
    return counts;
  }

  /** the words in a match set */
  *words(bucket: Bucket, set: Bitset): Generator<{ word: string; flags: number }> {
    for (const i of members(set)) yield { word: bucket.words[i], flags: bucket.flags[i] };
  }

  /** total words allowed by the current options */
  get size() {
    let n = 0;
    for (const bucket of this.buckets.values()) n += count(bucket.allowed);
    return n;
  }
}
