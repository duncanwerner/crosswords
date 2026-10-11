import { describe, expect, it } from 'vitest';
import { createPuzzle, fromTemplate, isComplete } from './puzzle';
import { computeLights } from './lights';

const filled = () => {
  const p = createPuzzle({ rows: 3, cols: 3, style: 'blocked', symmetry: 'rotational', template: 'lattice' });
  for (const c of p.cells) if (!c.block) c.letter = 'A';
  return p;
};

describe('isComplete', () => {
  it('needs every square filled and every answer clued', () => {
    const p = filled();
    const lights = computeLights(p).lights;
    expect(isComplete(p)).toBe(false);
    for (const l of lights) p.clues[l.key] = { text: 'Clue', enumeration: '' };
    expect(isComplete(p)).toBe(true);
    p.cells[0].letter = '';
    expect(isComplete(p)).toBe(false);
  });

  it("doesn't need explanations, or clues on the later parts of a linked answer", () => {
    const p = filled();
    const [first, second, ...rest] = computeLights(p).lights;
    p.clues[first.key] = { text: 'Clue', enumeration: '', links: [second.key] };
    for (const l of rest) p.clues[l.key] = { text: 'Clue', enumeration: '' };
    expect(isComplete(p)).toBe(true);
    p.clues[rest[0].key] = { text: ' ', enumeration: '', explanation: 'An explanation' };
    expect(isComplete(p)).toBe(false);
  });

  it('is false for a grid with no lights', () => {
    const p = createPuzzle({ rows: 3, cols: 3, style: 'blocked', symmetry: 'none', template: 'empty' });
    for (const c of p.cells) c.block = true;
    expect(isComplete(p)).toBe(false);
  });
});

describe('fromTemplate', () => {
  it('copies the grid only', () => {
    const t = filled();
    t.style = 'barred';
    t.template = true;
    t.title = 'Barred 3';
    t.cells[0].barRight = true;
    t.cells[3].barBottom = true;
    t.cells[0].auto = true;
    t.clues['0,0,A'] = { text: 'Clue', enumeration: '3', explanation: 'Why' };
    t.blocked = ['ELS'];
    t.required = ['CAT'];
    const p = fromTemplate(t, 'Mine');
    expect(p.id).not.toBe(t.id);
    expect(p.revision).toBe(1);
    expect(p).toMatchObject({ title: 'Mine', rows: 3, cols: 3, style: 'barred', symmetry: t.symmetry, clues: {}, blocked: [], required: [] });
    expect(p.template).toBeUndefined();
    expect(p.cells.map(c => [c.block, c.barRight, c.barBottom])).toEqual(t.cells.map(c => [c.block, c.barRight, c.barBottom]));
    expect(p.cells.every(c => !c.letter && !c.auto)).toBe(true);
    expect(fromTemplate(t).title).toBe('Untitled');
  });
});
