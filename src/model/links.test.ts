import { describe, expect, it } from 'vitest';
import { computeLights } from './lights';
import { checkLinks, computeEntries, parseLinks } from './links';
import { gridFrom } from './test-helpers';
import type { Light, LightKey } from './types';

// 1 . 2 . 3
// . # . # .
// 4 . . . .
// . # . # .
// 5 . . . .
const map = computeLights(gridFrom(['.....', '.#.#.', '.....', '.#.#.', '.....']));
const light = (number: number, dir: 'across' | 'down') => map.lights.find(l => l.number === number && l.dir === dir)!;
const keys = (...lights: Light[]) => lights.map(l => l.key);

describe('computeEntries', () => {
  it('makes one entry per light without links', () => {
    const e = computeEntries(map, {});
    expect(e.list).toHaveLength(map.lights.length);
    expect(e.byLight.get(light(4, 'across').key)!.label).toBe('4');
  });

  it('chains a head with its linked lights', () => {
    const e = computeEntries(map, { [light(1, 'across').key]: keys(light(5, 'across'), light(3, 'down')) });
    const entry = e.byLight.get(light(3, 'down').key)!;
    expect(entry.key).toBe(light(1, 'across').key);
    expect(entry.label).toBe('1/5/3 down');
    expect(entry.cells).toEqual([...light(1, 'across').cells, ...light(5, 'across').cells, ...light(3, 'down').cells]);
    // members don't get entries of their own
    expect(e.list).toHaveLength(map.lights.length - 2);
    expect(e.list.some(x => x.key === light(5, 'across').key)).toBe(false);
  });

  it('ignores missing lights, and lights an earlier chain claimed', () => {
    const e = computeEntries(map, {
      [light(1, 'across').key]: ['9,9,A' as LightKey, light(4, 'across').key],
      [light(5, 'across').key]: keys(light(4, 'across')),
      [light(2, 'down').key]: keys(light(2, 'down')),
    });
    expect(e.byLight.get(light(4, 'across').key)!.label).toBe('1/4');
    // 5's only link was taken, and 2 linked only to itself: both stay single
    expect(e.byLight.get(light(5, 'across').key)!.lights).toHaveLength(1);
    expect(e.byLight.get(light(2, 'down').key)!.lights).toHaveLength(1);
  });
});

describe('parseLinks', () => {
  const head = light(1, 'across');
  it('reads numbers with optional directions', () => {
    expect(parseLinks('5', map, head)).toEqual({ keys: keys(light(5, 'across')) });
    expect(parseLinks('5, 3d / 2 down', map, head)).toEqual({ keys: keys(light(5, 'across'), light(3, 'down'), light(2, 'down')) });
    expect(parseLinks('4 5', map, head)).toEqual({ keys: keys(light(4, 'across'), light(5, 'across')) });
    expect(parseLinks('', map, head)).toEqual({ keys: [] });
  });

  it('prefers the head direction, else takes the light that exists', () => {
    expect(parseLinks('2', map, head)).toEqual({ keys: keys(light(2, 'down')) });
    expect(parseLinks('1', map, light(3, 'down'))).toEqual({ keys: keys(light(1, 'down')) });
  });

  it('explains what it cannot read', () => {
    expect(parseLinks('5x', map, head)).toHaveProperty('error');
    expect(parseLinks('9', map, head)).toEqual({ error: "There's no 9." });
    expect(parseLinks('2a', map, head)).toEqual({ error: "There's no 2 across." });
    expect(parseLinks('1a', map, head)).toEqual({ error: "1 across can't link to itself." });
  });
});

describe('checkLinks', () => {
  const entries = computeEntries(map, { [light(1, 'across').key]: keys(light(5, 'across')) });
  it('allows free lights and re-linking the same chain', () => {
    expect(checkLinks(light(1, 'across'), keys(light(5, 'across'), light(4, 'across')), entries)).toBeUndefined();
  });
  it('refuses lights in another chain', () => {
    expect(checkLinks(light(4, 'across'), keys(light(5, 'across')), entries)).toBe('5 across is already part of 1/5 across.');
    expect(checkLinks(light(4, 'across'), keys(light(1, 'across')), entries)).toBe('1 across already has links of its own.');
  });
});
