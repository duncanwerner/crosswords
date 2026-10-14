import { describe, expect, it } from 'vitest';
import { computeLights } from '../model/lights';
import { computeEntries } from '../model/links';
import { gridFrom } from '../model/test-helpers';
import type { ClueStatus, LightKey } from '../model/types';
import { type ReviewContext, describeCall, runToolCalls } from './tools';

const grid = gridFrom(['CAT', '.#.', '...']);
const map = computeLights(grid);
const entries = computeEntries(map, {});

const fake = () => {
  const marks: Array<[LightKey, ClueStatus | undefined]> = [];
  const ctx: ReviewContext = {
    puzzle: { title: '', setter: '', style: 'blocked', ...grid, clues: {} },
    map: () => map,
    entries: () => entries,
    currentEntry: () => undefined,
    setStatus: (key, status) => marks.push([key, status]),
  };
  return { ctx, marks };
};

const call = (name: string, params: unknown, index = 0) => ({ name, params, index });

describe('runToolCalls', () => {
  it('reads the puzzle', async () => {
    const [result] = await runToolCalls(fake().ctx, [call('get_puzzle', {})]);
    expect(result.type).toBe('object');
    expect(result.content).toContain('1a (3) CAT clue: none');
  });

  it('sets and clears marks', async () => {
    const { ctx, marks } = fake();
    const results = await runToolCalls(ctx, [call('set_mark', { ref: '1d', mark: 'good' }, 0), call('set_mark', { ref: '1a', mark: 'none' }, 1)]);
    expect(results.map(r => r.index)).toEqual([0, 1]);
    expect(marks).toEqual([[map.lights.find(l => l.dir === 'down' && l.number === 1)!.key, 'good'], [map.lights[0].key, undefined]]);
  });

  it('returns errors for bad refs and bad input', async () => {
    const { ctx, marks } = fake();
    const [bad, invalid] = await runToolCalls(ctx, [call('set_mark', { ref: '9a', mark: 'good' }, 0), call('set_mark', { ref: '1a', mark: 'great' }, 1)]);
    expect(bad).toMatchObject({ type: 'error', content: "There's no 9 across." });
    expect(invalid.type).toBe('error');
    expect(marks).toEqual([]);
  });

  it('ignores partial calls', async () => {
    expect(await runToolCalls(fake().ctx, [call('set_mark', '{"ref":"1')], true)).toEqual([]);
  });
});

describe('describeCall', () => {
  it('labels calls, even with arguments still streaming', () => {
    expect(describeCall('set_mark', { ref: '12d', mark: 'needs_work' })).toBe('marked 12d needs work');
    expect(describeCall('get_entry', '{"ref":"5a"}')).toBe('read 5a');
    expect(describeCall('get_entry', '{"ref":')).toBe('read …');
  });
});
