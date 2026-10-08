/** fixed-size bitsets over Uint32Array; all sets in an operation share a size */

export type Bitset = Uint32Array;

export const words32 = (bits: number) => (bits + 31) >>> 5;

export const full = (bits: number): Bitset => {
  const set = new Uint32Array(words32(bits)).fill(0xffffffff);
  const extra = set.length * 32 - bits;
  if (extra) set[set.length - 1] >>>= extra;
  return set;
};

export const set = (b: Bitset, i: number) => {
  b[i >>> 5] |= 1 << (i & 31);
};

export const has = (b: Bitset, i: number) => (b[i >>> 5] & (1 << (i & 31))) !== 0;

/** a &= b, in place */
export const andInto = (a: Bitset, b: Bitset) => {
  for (let i = 0; i < a.length; i++) a[i] &= b[i];
  return a;
};

const pop32 = (v: number) => {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export const count = (b: Bitset) => {
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i]) n += pop32(b[i]);
  return n;
};

/** popcount of a & b without allocating */
export const countAnd = (a: Bitset, b: Bitset) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i] & b[i];
    if (v) n += pop32(v);
  }
  return n;
};

/** indexes of set bits, in order */
export function* members(b: Bitset): Generator<number> {
  for (let w = 0; w < b.length; w++) {
    let v = b[w];
    while (v) {
      const low = v & -v;
      yield (w << 5) + 31 - Math.clz32(low);
      v ^= low;
    }
  }
}
