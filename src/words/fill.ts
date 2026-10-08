import { type GridShape, computeLights } from '../model/lights';
import type { Light, LightKey } from '../model/types';
import { count, countAnd, members } from './bitset';
import type { WordIndex } from './word-index';

/**
 * grid auto-fill as constraint search:
 *  - most-constrained light first (fewest matching words);
 *  - candidates ordered by how many options they leave each crossing, with
 *    some noise so runs differ, and any candidate that leaves a crossing
 *    with no words is skipped (forward checking);
 *  - no duplicate words; blocked words never appear (the index handles it);
 *  - restarts with growing node limits (Luby sequence) so one bad early
 *    choice can't sink the whole run.
 *
 * the solver is a step machine with an explicit stack, so the worker can
 * run it in short slices and stay responsive to cancel.
 */

export interface FillInput {
  rows: number;
  cols: number;
  /** blocks and bars; letters are ignored here */
  shape: GridShape['cells'];
  /** one char per cell: A-Z fixed, '.' empty */
  letters: string;
  seed: number;
}

export type FillStatus = 'complete' | 'partial' | 'impossible' | 'cancelled';

export interface FillResult {
  status: FillStatus;
  /** the best fill found (A-Z or '.') */
  letters: string;
  /** lights filled in that result, of the lights that needed filling */
  filled: number;
  total: number;
  nodes: number;
  restarts: number;
  ms: number;
  /** the light that most often had no candidates */
  hardest?: { key: LightKey; number: number; dir: Light['dir'] };
  message?: string;
}

const A = 65;
const EMPTY = 0;

/** small, seedable PRNG (mulberry32) */
const random = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Luby restart sequence: 1 1 2 1 1 2 4 1 1 2 1 1 2 4 8 ... */
const luby = (i: number): number => {
  let k = 1;
  while ((1 << k) - 1 < i) k++;
  return (1 << k) - 1 === i ? 1 << (k - 1) : luby(i - (1 << (k - 1)) + 1);
};

interface Frame {
  light: number;
  candidates: string[];
  next: number;
  /** cells this frame's current word filled */
  placed: number[];
  /** crossing lights its current word completed */
  completed: number[];
}

export class Filler {
  readonly lights: Light[];
  readonly total: number;
  /** per light, per position: the crossing light and its position there, or -1 */
  protected crossLight: Int32Array[];
  protected crossPos: Int32Array[];

  protected letters: Uint8Array;
  protected readonly initial: Uint8Array;
  protected assigned: Uint8Array;
  protected readonly initialAssigned: Uint8Array;
  protected used = new Set<string>();
  protected readonly initialUsed: Set<string>;
  protected stack: Frame[] = [];

  protected rand: () => number;
  protected failures: Uint32Array;
  protected best: { letters: Uint8Array; filled: number };

  nodes = 0;
  restarts = 0;
  protected restartNodes = 0;
  protected restartLimit: number;
  /** set when the initial grid can't be filled at all */
  impossible?: string;

  constructor(protected index: WordIndex, input: FillInput, protected baseLimit = 300) {
    const grid = { rows: input.rows, cols: input.cols, cells: input.shape };
    this.lights = computeLights(grid).lights;
    const n = input.rows * input.cols;

    this.crossLight = this.lights.map(l => new Int32Array(l.length).fill(-1));
    this.crossPos = this.lights.map(l => new Int32Array(l.length).fill(-1));
    const at = new Map<number, Array<{ light: number; pos: number }>>();
    this.lights.forEach((l, li) => l.cells.forEach((cell, pos) => {
      const list = at.get(cell) ?? [];
      list.push({ light: li, pos });
      at.set(cell, list);
    }));
    for (const list of at.values()) {
      if (list.length !== 2) continue;
      const [a, b] = list;
      this.crossLight[a.light][a.pos] = b.light;
      this.crossPos[a.light][a.pos] = b.pos;
      this.crossLight[b.light][b.pos] = a.light;
      this.crossPos[b.light][b.pos] = a.pos;
    }

    this.initial = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const c = input.letters.charCodeAt(i) - A;
      this.initial[i] = c >= 0 && c < 26 ? c + 1 : EMPTY;
    }
    this.letters = this.initial.slice();

    // lights already complete are fixed, whether or not they're dictionary words
    this.initialAssigned = new Uint8Array(this.lights.length);
    this.initialUsed = new Set();
    this.lights.forEach((l, li) => {
      if (l.cells.every(c => this.initial[c] !== EMPTY)) {
        this.initialAssigned[li] = 1;
        this.initialUsed.add(this.word(li));
      }
    });
    this.assigned = this.initialAssigned.slice();
    this.used = new Set(this.initialUsed);
    this.total = this.lights.length - this.initialAssigned.reduce((a, b) => a + b, 0);

    this.rand = random(input.seed);
    this.failures = new Uint32Array(this.lights.length);
    this.best = { letters: this.letters.slice(), filled: 0 };
    this.restartLimit = baseLimit;

    // a partly filled light with no matches makes the whole grid impossible
    for (let li = 0; li < this.lights.length; li++) {
      if (!this.assigned[li] && this.domainSize(li) === 0) {
        const l = this.lights[li];
        this.failures[li]++;
        this.impossible = `No ${this.index.buckets.has(l.length) ? 'words fit' : `${l.length}-letter words exist for`} ${l.number} ${l.dir} (${this.pattern(li).replace(/\./g, '·')}).`;
        break;
      }
    }
  }

  protected pattern(li: number) {
    let s = '';
    for (const c of this.lights[li].cells) s += this.letters[c] ? String.fromCharCode(A - 1 + this.letters[c]) : '.';
    return s;
  }

  protected word(li: number) {
    return this.pattern(li);
  }

  protected domainSize(li: number) {
    const m = this.index.match(this.pattern(li));
    return m ? count(m.set) : 0;
  }

  /** lights filled in the best state found so far */
  get bestFilled() {
    return this.best.filled;
  }

  get filled() {
    let n = 0;
    for (let li = 0; li < this.lights.length; li++) if (this.assigned[li] && !this.initialAssigned[li]) n++;
    return n;
  }

  /** the most constrained open light, or -1 when everything is filled */
  protected pick(): { light: number; size: number } {
    let best = -1;
    let bestSize = Infinity;
    for (let li = 0; li < this.lights.length; li++) {
      if (this.assigned[li]) continue;
      const size = this.domainSize(li);
      // ties broken by length (longer lights are harder to fit later), then randomly
      if (size < bestSize || (size === bestSize && this.lights[li].length > this.lights[best].length)) {
        best = li;
        bestSize = size;
      }
      if (size === 0) break;
    }
    return { light: best, size: bestSize };
  }

  /** candidates for a light, best first; ones that kill a crossing are dropped */
  protected candidates(li: number): string[] {
    const light = this.lights[li];
    const m = this.index.match(this.pattern(li));
    if (!m) return [];
    const checks: Array<{ pos: number; counts: Uint32Array }> = [];
    for (let pos = 0; pos < light.length; pos++) {
      if (this.letters[light.cells[pos]] !== EMPTY) continue;
      const cross = this.crossLight[li][pos];
      if (cross < 0 || this.assigned[cross]) continue;
      const cm = this.index.match(this.pattern(cross));
      const counts = new Uint32Array(26);
      if (cm) {
        const p = this.crossPos[li][pos];
        for (let c = 0; c < 26; c++) counts[c] = countAnd(cm.set, this.index.mask(cm.bucket, p, c));
      }
      checks.push({ pos, counts });
    }

    const scored: Array<{ word: string; score: number }> = [];
    for (const i of members(m.set)) {
      const word = m.bucket.words[i];
      if (this.used.has(word)) continue;
      let score = 0;
      let dead = false;
      for (const check of checks) {
        const n = check.counts[word.charCodeAt(check.pos) - A];
        if (!n) {
          dead = true;
          break;
        }
        score += Math.log2(n + 1);
      }
      if (dead) continue;
      // noise: enough to vary the fill between runs, not enough to bury good words
      scored.push({ word, score: score + this.rand() * 2.5 });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.word);
  }

  /** put a word in a light; false (and nothing changed) if it duplicates a word it completes */
  protected place(frame: Frame, word: string): boolean {
    const light = this.lights[frame.light];
    frame.placed = [];
    frame.completed = [];
    for (let pos = 0; pos < light.length; pos++) {
      const cell = light.cells[pos];
      if (this.letters[cell] === EMPTY) {
        this.letters[cell] = word.charCodeAt(pos) - A + 1;
        frame.placed.push(cell);
      }
    }
    this.assigned[frame.light] = 1;
    this.used.add(word);
    for (let pos = 0; pos < light.length; pos++) {
      const cross = this.crossLight[frame.light][pos];
      if (cross < 0 || this.assigned[cross]) continue;
      if (this.lights[cross].cells.every(c => this.letters[c] !== EMPTY)) {
        const crossWord = this.word(cross);
        if (this.used.has(crossWord)) {
          this.unplace(frame, word);
          return false;
        }
        this.assigned[cross] = 1;
        this.used.add(crossWord);
        frame.completed.push(cross);
      }
    }
    return true;
  }

  protected unplace(frame: Frame, word: string) {
    for (const cross of frame.completed) {
      this.assigned[cross] = 0;
      this.used.delete(this.word(cross));
    }
    for (const cell of frame.placed) this.letters[cell] = EMPTY;
    this.assigned[frame.light] = 0;
    this.used.delete(word);
    frame.placed = [];
    frame.completed = [];
  }

  protected restart() {
    this.restarts++;
    this.letters = this.initial.slice();
    this.assigned = this.initialAssigned.slice();
    this.used = new Set(this.initialUsed);
    this.stack = [];
    this.restartNodes = 0;
    this.restartLimit = this.baseLimit * luby(this.restarts + 1);
  }

  protected noteBest() {
    const filled = this.filled;
    if (filled > this.best.filled) this.best = { letters: this.letters.slice(), filled };
  }

  /**
   * advance the search by up to `budget` nodes. returns 'complete' when the
   * grid is full, 'running' otherwise (it restarts itself on dead ends).
   */
  run(budget: number): 'complete' | 'running' | 'impossible' {
    if (this.impossible) return 'impossible';
    for (let n = 0; n < budget; n++) {
      if (this.restartNodes >= this.restartLimit) this.restart();

      const top = this.stack[this.stack.length - 1];
      // descend once the top frame holds a word: choose the next light
      if (!top || this.assigned[top.light]) {
        const { light, size } = this.pick();
        if (light < 0) {
          this.noteBest();
          return 'complete';
        }
        this.nodes++;
        this.restartNodes++;
        if (size === 0) {
          this.failures[light]++;
          if (!this.backtrack()) return this.exhausted();
          continue;
        }
        this.stack.push({ light, candidates: this.candidates(light), next: 0, placed: [], completed: [] });
        continue;
      }

      // try the next candidate in the top frame
      if (!this.tryNext(top)) {
        this.failures[top.light]++;
        this.stack.pop();
        if (!this.backtrack()) return this.exhausted();
      }
    }
    return 'running';
  }

  protected tryNext(frame: Frame): boolean {
    while (frame.next < frame.candidates.length) {
      const word = frame.candidates[frame.next++];
      if (this.used.has(word)) continue;
      if (this.place(frame, word)) {
        this.noteBest();
        return true;
      }
    }
    return false;
  }

  /** undo the top frame's word and move it on to its next candidate */
  protected backtrack(): boolean {
    while (this.stack.length) {
      const frame = this.stack[this.stack.length - 1];
      const word = frame.candidates[frame.next - 1];
      if (word !== undefined && this.assigned[frame.light]) this.unplace(frame, word);
      if (this.tryNext(frame)) return true;
      this.failures[frame.light]++;
      this.stack.pop();
    }
    return false;
  }

  /**
   * the stack emptied before the restart limit: every branch from the
   * starting grid was tried (pruning only drops words that can't work),
   * so no fill exists.
   */
  protected exhausted(): 'impossible' {
    this.impossible ??= 'No fill exists for this grid with the current dictionary and block list.';
    return 'impossible';
  }

  result(status: FillStatus, ms: number): FillResult {
    const letters = Array.from(status === 'complete' ? this.letters : this.best.letters, v => (v ? String.fromCharCode(A - 1 + v) : '.')).join('');
    let hardest: FillResult['hardest'];
    if (status !== 'complete') {
      let max = 0;
      this.failures.forEach((f, li) => {
        if (f > max) {
          max = f;
          const l = this.lights[li];
          hardest = { key: l.key, number: l.number, dir: l.dir };
        }
      });
    }
    return {
      status,
      letters,
      filled: status === 'complete' ? this.total : this.best.filled,
      total: this.total,
      nodes: this.nodes,
      restarts: this.restarts,
      ms,
      hardest,
      message: this.impossible,
    };
  }
}
