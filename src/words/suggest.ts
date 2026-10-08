import type { SuggestRequest, SuggestResult, Suggestion } from './protocol';
import type { WordIndex } from './word-index';

const A = 65;

/**
 * candidate words for a light, ranked by how open they leave the crossing
 * lights: words that kill a crossing (leave it no options) sink to the
 * bottom, then higher combined crossing options first.
 */
export const suggest = (index: WordIndex, req: SuggestRequest): SuggestResult => {
  const m = index.match(req.pattern);
  if (!m) return { total: 0, matched: 0, viable: 0, items: [] };

  const crossings = req.crossings.map(c => ({ index: c.index, counts: index.letterCounts(c.pattern, c.position) }));
  const used = new Set(req.used);

  let total = 0;
  let viable = 0;
  const list: Suggestion[] = [];
  for (const { word, flags } of index.words(m.bucket, m.set)) {
    total++;
    if (req.filter && !word.includes(req.filter)) continue;
    let min = Infinity;
    let score = 0;
    for (const c of crossings) {
      const n = c.counts[word.charCodeAt(c.index) - A];
      if (n < min) min = n;
      score += Math.log2(n + 1);
    }
    if (min > 0) viable++;
    list.push({ word, flags, min, score, used: used.has(word) });
  }

  list.sort((a, b) =>
    (Number(b.min > 0) - Number(a.min > 0)) ||
    (Number(a.used) - Number(b.used)) ||
    (b.score - a.score) ||
    (a.word < b.word ? -1 : 1));

  return { total, matched: list.length, viable, items: list.slice(0, req.limit) };
};
