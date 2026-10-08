import { describe, expect, it } from 'vitest';
import { computeLights } from '../model/lights';
import { gridFrom } from '../model/test-helpers';
import { Filler, type FillResult } from './fill';
import { WordIndex } from './word-index';

// one valid 3x3 square: COW/ARE/TEN across, CAT/ORE/WEN down
const WORDS = ['cow', 'are', 'ten', 'cat', 'ore', 'wen', 'cot', 'awe', 'tan', 'net', 'ewe', 'bat', 'bad', 'den', 'nod'];

const solve = (lines: string[], words = WORDS, blocked: string[] = [], seed = 1, required: string[] = []): FillResult => {
  const grid = gridFrom(lines);
  const index = new WordIndex(words);
  index.setBlocked(blocked);
  const filler = new Filler(index, {
    rows: grid.rows, cols: grid.cols, shape: grid.cells,
    letters: grid.cells.map(c => c.letter || '.').join(''),
    required,
    seed,
  });
  let state: ReturnType<Filler['run']> = 'running';
  for (let i = 0; i < 1000 && state === 'running'; i++) state = filler.run(100);
  return filler.result(state === 'running' ? 'partial' : state, 0);
};

/** every light is a dictionary word and none repeats */
const check = (lines: string[], letters: string, words = WORDS) => {
  const grid = gridFrom(lines);
  const dict = new Set(words.map(w => w.toUpperCase()));
  const seen = new Set<string>();
  for (const light of computeLights(grid).lights) {
    const word = light.cells.map(c => letters[c]).join('');
    expect(dict.has(word), `${word} is a word`).toBe(true);
    expect(seen.has(word), `${word} repeats`).toBe(false);
    seen.add(word);
  }
};

describe('Filler', () => {
  it('fills an open grid with valid, distinct words', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = solve(['...', '...', '...'], WORDS, [], seed);
      expect(r.status).toBe('complete');
      expect(r.filled).toBe(6);
      check(['...', '...', '...'], r.letters);
    }
  });

  it('keeps fixed letters', () => {
    const r = solve(['C..', '...', '..N']);
    expect(r.status).toBe('complete');
    expect(r.letters[0]).toBe('C');
    expect(r.letters[8]).toBe('N');
    check(['...', '...', '...'], r.letters);
  });

  it('treats complete lights as given, even if not in the dictionary', () => {
    const r = solve(['ZZZ', '#.#', '...'], ['bad', 'ado', 'zed', 'zen']);
    // ZZZ is fixed; the middle column Z?? must be ZED, so the bottom row is ADO
    expect(r.status).toBe('complete');
    expect(r.letters).toBe('ZZZ#E#ADO'.replace(/#/g, '.'));
  });

  it('reports an impossible starting pattern', () => {
    const r = solve(['...', '.X.', '...']);
    expect(r.status).toBe('impossible');
    expect(r.message).toMatch(/No words fit/);
  });

  it('proves impossibility when blocked words remove the only fills', () => {
    const r = solve(['...', '...', '...'], WORDS, ['ARE', 'ORE', 'AWE', 'EWE']);
    expect(r.status).toBe('impossible');
    expect(r.hardest).toBeDefined();
  });

  it('never uses a word twice', () => {
    // a symmetric square would need CAT twice; only that square exists here
    const r = solve(['...', '...', '...'], ['cat', 'are', 'tea']);
    expect(r.status).toBe('impossible');
  });
});

describe('Filler, required words', () => {
  const rows = (letters: string) => [letters.slice(0, 3), letters.slice(3, 6), letters.slice(6, 9)];

  it('places required words, even ones not in the dictionary', () => {
    // with ZZZ in the bottom row, the columns must be ?·Z words
    const words = ['cab', 'cob', 'adz', 'biz', 'ado', 'baa', 'oaf', 'coz', 'abz'];
    for (const seed of [1, 2, 3]) {
      const r = solve(['...', '...', '...'], words, [], seed, ['ZZZ']);
      if (r.status !== 'complete') {
        expect(r.status).toBe('impossible');
        continue;
      }
      expect(rows(r.letters)).toContain('ZZZ');
    }
  });

  it('puts each required word where the rest of the grid can be filled', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = solve(['...', '...', '...'], WORDS, [], seed, ['TEN', 'ORE']);
      expect(r.status).toBe('complete');
      check(['...', '...', '...'], r.letters);
      // the only square is COW/ARE/TEN by CAT/ORE/WEN, either way round
      expect(['COWARETEN', 'CATOREWEN']).toContain(r.letters);
    }
  });

  it('is satisfied by a word already in the grid', () => {
    const r = solve(['COW', '...', '...'], WORDS, [], 1, ['COW']);
    expect(r.status).toBe('complete');
    expect(r.letters).toBe('COWARETEN');
  });

  it('gives up when a required word has no light of its length', () => {
    const r = solve(['...', '...', '...'], WORDS, [], 1, ['OBAMA']);
    expect(r.status).toBe('impossible');
    expect(r.message).toMatch(/no open 5-letter light for OBAMA/);
  });

  it('gives up when there are more required words than lights for them', () => {
    const r = solve(['...', '#.#', '...'], WORDS, [], 1, ['COW', 'TEN', 'CAT', 'ORE']);
    expect(r.status).toBe('impossible');
    expect(r.message).toMatch(/Too many required 3-letter words/);
  });

  it('gives up when a required word clashes with the letters', () => {
    const r = solve(['X..', 'X..', 'X..'], WORDS, [], 1, ['COW']);
    expect(r.status).toBe('impossible');
  });

  it('proves no fill exists with the required words', () => {
    // NOD fits a light, but no square contains it
    const r = solve(['...', '...', '...'], WORDS, [], 1, ['NOD']);
    expect(r.status).toBe('impossible');
    expect(r.message).toMatch(/required words/);
  });

  it('only reports partial fills that contain every required word', () => {
    // COW and WEN fit together and each fits with NOD, but never all three
    const grid = gridFrom(['...', '...', '...']);
    for (const seed of [1, 2, 3]) {
      const filler = new Filler(new WordIndex(WORDS), {
        rows: 3, cols: 3, shape: grid.cells, letters: '.........', required: ['COW', 'WEN', 'NOD'], seed,
      });
      expect(filler.run(1000)).toBe('impossible');
      expect(filler.bestFilled).toBe(0);
    }
  });
});
