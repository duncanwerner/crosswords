import type { LightMap } from './lights';
import type { Direction, Light, LightKey } from './types';

/**
 * linked clues: one clue whose answer runs through several lights, e.g.
 * "1/5". the first light (the head) holds the clue, the enumeration for
 * the whole answer, and the list of the lights it continues into. the
 * others show "See 1".
 */

/** one answer: a single light, or a head light and the lights it links to */
export interface Entry {
  /** the head light's key; its clue belongs to the whole entry */
  key: LightKey;
  /** the head first, then the linked lights in order */
  lights: Light[];
  /** every cell, in reading order through the parts */
  cells: number[];
  /** "1", "1/5", or "1/5 down" when a part runs the other way */
  label: string;
}

export interface Entries {
  /** one per answer, in light order (members of a chain are skipped) */
  list: Entry[];
  /** every light's entry */
  byLight: Map<LightKey, Entry>;
}

/** each head light's links, as stored on its clue */
export type LinkMap = Partial<Record<LightKey, readonly LightKey[]>>;

const makeEntry = (lights: Light[]): Entry => {
  const head = lights[0];
  return {
    key: head.key,
    lights,
    cells: lights.flatMap(l => l.cells),
    label: lights.map((l, i) => (i && l.dir !== head.dir ? `${l.number} ${l.dir}` : String(l.number))).join('/'),
  };
};

/**
 * group lights into answers. links to lights that no longer exist are
 * ignored, as are links to a light that an earlier chain already claimed
 * (earlier in light order: across first, then down).
 */
export const computeEntries = (map: LightMap, links: LinkMap): Entries => {
  const byKey = new Map(map.lights.map(l => [l.key, l]));
  const claimed = new Set<LightKey>();
  const chains = new Map<LightKey, Light[]>();
  for (const light of map.lights) {
    const keys = links[light.key];
    if (!keys?.length || claimed.has(light.key)) continue;
    const parts = [light];
    for (const key of keys) {
      const part = byKey.get(key);
      if (!part || claimed.has(key) || parts.includes(part)) continue;
      parts.push(part);
    }
    if (parts.length < 2) continue;
    for (const p of parts) claimed.add(p.key);
    chains.set(light.key, parts);
  }

  const list: Entry[] = [];
  const byLight = new Map<LightKey, Entry>();
  for (const light of map.lights) {
    const chain = chains.get(light.key);
    if (claimed.has(light.key) && !chain) continue;
    const entry = makeEntry(chain ?? [light]);
    list.push(entry);
    for (const l of entry.lights) byLight.set(l.key, entry);
  }
  return { list, byLight };
};

/** how a linked light is written in the links field: "5a", "12d" */
export const formatRef = (light: Light) => `${light.number}${light.dir === 'across' ? 'a' : 'd'}`;

const REF = /^(\d+)\s*(a|ac|across|d|dn|down)?$/i;

/**
 * read the links field: "5", "5d, 12 across", "5/12". a bare number
 * means the light running the same way as the head, if there is one.
 */
export const parseLinks = (text: string, map: LightMap, head: Light): { keys: LightKey[] } | { error: string } => {
  const keys: LightKey[] = [];
  const refs = text.split(/[,/;]|\s+(?=\d)/).map(s => s.trim()).filter(Boolean);
  for (const ref of refs) {
    const m = REF.exec(ref);
    if (!m) return { error: `Couldn't read “${ref}”. Use numbers like 5 or 12d.` };
    const number = Number(m[1]);
    const dir: Direction | undefined = m[2] ? (m[2][0].toLowerCase() === 'a' ? 'across' : 'down') : undefined;
    const matches = map.lights.filter(l => l.number === number && (!dir || l.dir === dir));
    const light = matches.find(l => l.dir === head.dir) ?? matches[0];
    if (!light) return { error: `There's no ${number}${dir ? ` ${dir}` : ''}.` };
    if (light.key === head.key) return { error: `${head.number} ${head.dir} can't link to itself.` };
    if (!keys.includes(light.key)) keys.push(light.key);
  }
  return { keys };
};

/**
 * why the head can't take these links, if it can't: a light can only be
 * part of one answer, and a head can't be linked into another chain.
 */
export const checkLinks = (head: Light, keys: readonly LightKey[], entries: Entries): string | undefined => {
  for (const key of keys) {
    const entry = entries.byLight.get(key);
    if (!entry || entry.key === head.key || entry.lights.length < 2) continue;
    const light = entry.lights.find(l => l.key === key)!;
    return entry.key === key
      ? `${light.number} ${light.dir} already has links of its own.`
      : `${light.number} ${light.dir} is already part of ${entry.label} ${entry.lights[0].dir}.`;
  }
  return undefined;
};
