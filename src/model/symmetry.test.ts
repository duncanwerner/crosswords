import { describe, expect, it } from 'vitest';
import { symmetricPartner } from './symmetry';

describe('symmetricPartner', () => {
  it('rotates blocks 180 degrees', () => {
    expect(symmetricPartner({ feature: 'block', row: 0, col: 0 }, 15, 15, 'rotational'))
      .toEqual({ feature: 'block', row: 14, col: 14 });
    expect(symmetricPartner({ feature: 'block', row: 7, col: 7 }, 15, 15, 'rotational'))
      .toEqual({ feature: 'block', row: 7, col: 7 });
    expect(symmetricPartner({ feature: 'block', row: 1, col: 2 }, 4, 6, 'rotational'))
      .toEqual({ feature: 'block', row: 2, col: 3 });
  });

  it('maps a right bar to the right bar of the cell left of the rotated cell', () => {
    // bar between (0,0) and (0,1) in 3x3 <-> bar between (2,1) and (2,2)
    expect(symmetricPartner({ feature: 'barRight', row: 0, col: 0 }, 3, 3, 'rotational'))
      .toEqual({ feature: 'barRight', row: 2, col: 1 });
    // centre vertical bar in an even-width grid maps to itself (mirrored row)
    expect(symmetricPartner({ feature: 'barRight', row: 1, col: 1 }, 3, 4, 'rotational'))
      .toEqual({ feature: 'barRight', row: 1, col: 1 });
  });

  it('maps a bottom bar to the bottom bar of the cell above the rotated cell', () => {
    expect(symmetricPartner({ feature: 'barBottom', row: 0, col: 0 }, 3, 3, 'rotational'))
      .toEqual({ feature: 'barBottom', row: 1, col: 2 });
  });

  it('has no partner for outer-edge bars or with symmetry off', () => {
    expect(symmetricPartner({ feature: 'barRight', row: 0, col: 2 }, 3, 3, 'rotational')).toBeUndefined();
    expect(symmetricPartner({ feature: 'block', row: 0, col: 0 }, 3, 3, 'none')).toBeUndefined();
  });
});
