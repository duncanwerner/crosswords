import type { Symmetry } from './types';

/** something you can toggle in design mode */
export type Feature = 'block' | 'barRight' | 'barBottom';

export interface FeatureAt {
  feature: Feature;
  row: number;
  col: number;
}

/**
 * the partner of a feature under the given symmetry. returns undefined
 * if there is no partner (symmetry off, or the partner would be off-grid,
 * which only happens for bars on the outer edge, which are meaningless anyway).
 * the partner may be the same feature (e.g. the centre cell).
 */
export const symmetricPartner = (
  at: FeatureAt, rows: number, cols: number, symmetry: Symmetry,
): FeatureAt | undefined => {
  if (symmetry === 'none') return undefined;
  const { feature, row, col } = at;
  let r = rows - 1 - row;
  let c = cols - 1 - col;
  // a bar on the right of (r, c) maps to a bar on the left of the rotated
  // cell, i.e. the right of the cell before it. same for bottom.
  if (feature === 'barRight') c -= 1;
  if (feature === 'barBottom') r -= 1;
  if (r < 0 || c < 0 || r >= rows || c >= cols) return undefined;
  return { feature, row: r, col: c };
};
