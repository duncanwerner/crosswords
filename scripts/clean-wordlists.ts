/**
 * rewrite public/wordlists/*.json as plain ASCII: diacritics removed,
 * non-letters dropped, original case kept (the app uses case to tell proper
 * nouns from common words), duplicates removed, sorted.
 *
 *   node scripts/clean-wordlists.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toAscii } from '../src/model/ascii.ts';

const dir = join(import.meta.dirname, '..', 'public', 'wordlists');

for (const name of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const path = join(dir, name);
  const words: string[] = JSON.parse(readFileSync(path, 'utf8'));
  const changed: string[] = [];
  const out = new Set<string>();
  for (const word of words) {
    const clean = toAscii(word).replace(/[^A-Za-z]/g, '');
    if (clean !== word) changed.push(`${word} -> ${clean}`);
    if (clean) out.add(clean);
  }
  const list = [...out].sort();
  writeFileSync(path, JSON.stringify(list));
  console.log(`${name}: ${words.length} -> ${list.length} words; ${changed.length} changed`, changed.slice(0, 10));
}
