import { describe, expect, it } from 'vitest';
import { computeLights } from './lights';
import { computeStats } from './stats';
import { gridFrom } from './test-helpers';

const stats = (lines: string[], symmetry: 'rotational' | 'none' = 'rotational') => {
  const g = gridFrom(lines);
  return computeStats(g, computeLights(g), symmetry);
};

describe('computeStats', () => {
  it('counts checked and unchecked cells', () => {
    const s = stats(['...', '.#.', '...']);
    expect(s.across).toBe(2);
    expect(s.down).toBe(2);
    expect(s.checked).toBe(4);
    expect(s.unchecked).toBe(4);
    expect(s.warnings.map(w => w.kind)).not.toContain('asymmetric');
  });

  it('flags asymmetry, orphans and disconnection', () => {
    const s = stats(['.#.', '###', '...']);
    const kinds = s.warnings.map(w => w.kind);
    expect(kinds).toContain('asymmetric');
    expect(kinds).toContain('orphan');
    expect(kinds).toContain('disconnected');
  });
});
