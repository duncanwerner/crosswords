/**
 * we have global state (in the word list) but no local state,
 * so converting to a module. class is unecessary.
 */

// import WordList from '$lib/word-list.json';
// import { Words } from './word-list';
import { Base, Large, Insane, type WordList } from './word-list';
import { type Square, type ClueReference, ClueReferences, ClueReferenceGetText, ClueReferenceSetText } from './types';
import type { Grid } from './grid';

let Words = Large;

export const SetDictionary = (dictionary: 'base'|'large'|'insane') => {

  switch (dictionary) {
    case 'base':
      Words = Base;
      break;

    case 'insane':
      Words = Insane;
      break;

    default:
      Words = Large;
      break;
  }

};

export enum StepResult {
  success = 'success', 
  failure = 'failure', 
  threshold = 'threshold',
}

/**
 * in place knuth shuffle. returns list for use in fluent composition.
 * @param list 
 */
const Shuffle = <T>(list: T[]) => {
  for (let i = list.length - 1; i >= 1; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = list[j];
    list[j] = list[i];
    list[i] = temp;
  }
  return list;
};

const RandomEntry = <T>(list: T[]): T => {
  return list[Math.floor(Math.random() * list.length)];
};

/**
 * text should be a string, with . for empty characters.
 * @param text 
 * @param skiplist - optional list of words that we don't want for some reason
 */
export const Candidates = (text: string, skiplist: string[] = [], common = false): string[] => {

  const words = common ? Words.common : Words.list;

  const rex = new RegExp('^' + text + '$', 'i');
  const list = words[text.length];
  if (!list.length) {
    console.warn('no words available');
    return [];
  }

  return list.filter(test => rex.test(test) && !skiplist.includes(test.toUpperCase())).map(entry => entry.toUpperCase()).sort();

};

/**
 * this version does two things: (1) it gets the set of all letter combinations
 * from the word that are in the dictionary, plus the remainders; and it builds
 * a map of all those letter combinations to sub-combinations.
 * 
 * the idea is that you start with the first list, and then use the map on
 * the remainder to find all possible permutations. ideally this only does
 * each lookup once.
 * 
 * within the map, the left-hand side is always valid. so if a particular
 * combination maps to an array of length 0, there are no valid combinations.
 * and so on.
 * 
 */
 const Permutations5 = (letters: string[], prefix = '', balance: string[] = [], base = true, mapped = new Map<string, string[][]>()): string[][] => {

  const list: string[][] = [];
  const lj = letters.join('');

  if (base && mapped.has(lj)) {
    return mapped.get(lj) || [];
  }

  if (base && Words.sorted.has(lj)) {
    list.push([lj, balance.join('')]);
  }

  for (let i = 0; i < letters.length; i++) {
    const word = prefix + letters[i];

    // filter on word
    if (Words.sorted.has(word)) {
      list.push([word, [...balance, ...letters.slice(0, i), ...letters.slice(i+1)].join('')]);
    }

    // but recurse regardless
    if (letters.length > 1) {
      const right = [...balance, ...letters.slice(0, i)];
      list.push(...Permutations5(letters.slice(i + 1), word, right, false, mapped));

      // build map
      Permutations5([...balance, ...letters.slice(0, i), ...letters.slice(i+1)], undefined, undefined, true, mapped);
    }


  }

  if (base) {
    mapped.set(lj, list);
  }

  return list;

};

/**
 * given a list of string arrays of varying length, return all combinations
 */
const Combinatorial = (arr: string[][]): string[][] => {
  const list: string[][] = [];
  for (const entry of arr[0]) {
    if (arr.length === 1) {
      list.push([entry]);
    }
    else {
      for (const subentry of Combinatorial(arr.slice(1))) {
        list.push([entry, ...subentry]);
      }
    }
  }
  return list;
};

const ExpandList = (pairs: string[][], map: Map<string, string[][]>): string[][] => {

  const Tail = (pair: string[], map: Map<string, string[][]>, prefix: string[], set: Set<string>): string[][] => {

    const list: string[][] = [];

    // have we seen this already?
    const parts = [...prefix, ...pair].sort().join(',');

    if (set.has(parts)) {
      return [];
    }

    set.add(parts);

    if (!pair[1].length) {
      return [[...prefix, pair[0]].sort()];
    }

    const mapped = map.get(pair[1]) || [];
    for (const entry of mapped) {
      const sublist = Tail(entry, map, [...prefix, pair[0]], set);
      if (sublist.length) {
        list.push(...sublist);
      }
    }

    return list;

  };

  const set = new Set<string>();
  const list: string[][] = [];

  for (const pair of pairs) {
    list.push(...Tail(pair, map, [], set));
  }

  return list;

};

/**
 * this generates so many results as to be unhelpful. maybe we should 
 * limit the length of the edges?
 * 
 * also combinatorial is recursive and may (will) break
 * 
 * @param text 
 * @returns 
 */
export const Fit = (text: string): string[][] => {

  const results: string[][] = [];
  

  // split in two...

  for (let i = 0; i < text.length - 1; i++) {
    const a = text.slice(0, i + 1);
    const b = text.slice(i + 1);

    const list: string[][] = [[], []];

    for (let word of Words.raw) {
      word = word.toUpperCase();
      if (word.endsWith(a)) {
        list[0].push(word);
      }
      if (word.startsWith(b)) {
        list[1].push(word);
      }
    }

    if (list[0].length && list[1].length) {
      results.push(...Combinatorial(list));
    }

  }


  return results;
};

export const Anagrams = (text: string): string[][] => {

  const normal = text.toLocaleUpperCase();
  const letters = normal.split('').sort().join('');

  const mapped = new Map<string, string[][]>();
  const p = Permutations5(letters.split(''), undefined, undefined, true, mapped);

  // console.info({p, mapped});

  const list = ExpandList(p, mapped);
  
  // console.info({list});

  const flat: string[][] = [];
 
  for (const entry of list) {
    const list = entry.map(word => Words.sorted.get(word) || []);
    const combo = Combinatorial(list).map(entry => {
      return entry.sort((a, b) => {
        if (a.length === b.length) {
          return a.localeCompare(b);
        }
        return b.length - a.length;
      });
    });
    flat.push(...combo);
  }

  // here a and b are arrays of words, sort by longest word or average
  // word length, or what? (...) reverse count?

  flat.sort((a, b) => {
    const length = a.length - b.length;
    return length || a[0].localeCompare(b[0]);
  });

  // console.info({flat});

  return flat;

};

export const MatchRegexp = (pattern: string): string[] => {

  const rex = new RegExp(pattern, 'i');
  const list: string[] = [];

  for (const group of Words.list) {

    // there are empty indexes
    if (!group) { continue; }

    for (const word of group) {
      if (rex.test(word)) {
        list.push(word);
      }
    }
  }

  return list;

};

/**
 * like candidates, but gets multiple entries at once. 
 */
export const AllCandidates = (list: string[]) => {
  const result: Record<string, string[]> = {};
  for (const entry of list) {
    result[entry] = Candidates(entry);
  }
  return result;
}

/** utility */
function CountEmpty(ref: ClueReference) {
  let count = 0;
  for (let i = 0; i < ref.length; i++) {
    if (!ref[i].letter) { count++; }
  }
  return count;
}

/**
 * one step in the fill algorithm
 */
function Step(options: {
    list: ClueReference[], 
    limit: number, 
    counter: { count: number }, 
    filled: string[], 
    force: string[], 
    block: string[],
    common?: boolean }): StepResult {

    const { list, limit, counter, filled, force, block, common } = options;

    // should sort list by empty spaces (asc), because those with fewer spaces
    // will have fewer candidates. it's not consistent, though, so we need to 
    // re-sort in each step. although we should cache counts.

    // actually even sorting is a waste... could just walk and check count once
    // so here we find the word with the fewest empty spaces, everything else
    // goes on to the remainder list.

    // doesn't this mean we'll always go in the same direction? is that bad? (...)

    let remainder: ClueReference[] = [];
    let current = list[0];
    let forced_candidate = '';

    // forced first...

    if (force.length) {
      Shuffle(force);
      Shuffle(list);
      for (let i = 0; i < list.length; i++) {
        const text = ClueReferenceGetText(list[i]);

        if (new RegExp('^' + text + '$', 'i').test(force[0])) {
          forced_candidate = force[0];
          current = list[i];
          remainder = list.slice(0, i).concat(list.slice(i + 1));
          break;
        }

      }

      if (!forced_candidate) {
        return StepResult.failure;
      }

    }
    else {
      let empty = CountEmpty(current);

      for (let i = 1; i < list.length; i++) {
        const count = CountEmpty(list[i]);
        if (count < empty) {
          empty = count;
          remainder.push(current);
          current = list[i];
        }
        else {
          remainder.push(list[i]);
        }
      }
    }

    const text = ClueReferenceGetText(current);
    const candidates = Shuffle(Candidates(text, filled, common));

    if (forced_candidate) {
      candidates.unshift(forced_candidate);
    }

    for (const candidate of candidates) {

      if (block.includes(candidate)) {
        continue;
      }

      ClueReferenceSetText(current, candidate);
      
      if (!remainder.length) {
        return StepResult.success;
      }

      const result = Step({
        list: remainder, 
        limit, 
        counter, 
        filled: [...filled, candidate], 
        force: force.filter(test => test !== candidate), 
        block, 
        common,
      });

      if (result === StepResult.success || result === StepResult.threshold) {
        return result;
      }

      if (++counter.count >= limit) {
        // don't unwind, leave what's in there
        return StepResult.threshold;
      }

    }

    // unwind
    // console.info('unwind ->', text);
    ClueReferenceSetText(current, text);
    return StepResult.failure;

  }

  export const Fill = (squares: Square[][], limit = 2048, force: string[] = [], block: string[] = [], common?: boolean ) => {

    /////////

    squares = JSON.parse(JSON.stringify(squares)); // clone // why?

    // remove any uncomitted letters
    for (const row of squares) {
      for (const cell of row) {
        if (cell.letter && !cell.committed) {
          cell.letter = undefined;
        }
      }
    }

    const refs = ClueReferences(squares);

    // check that the include list is valid
    
    if (force.some(text => {
      return /[.\s]/.test(text);
    })) {
      return { squares, count: 0, result: StepResult.failure };
    }

    // it's possble we have some words already filled in, including
    // one of the ones we are trying to require. if so drop it from 
    // the list.
    //
    // that happens if you click fill after doing a partial fill, 
    // because we are now using the dialog routine every time.

    const filled: string[] = [];

    // normalize the lists

    force = force.map(word => word.trim().toUpperCase());
    block = block.map(word => word.trim().toUpperCase());

    const unfilled = Shuffle(refs.filter(ref => {
      const text = ClueReferenceGetText(ref);
      if (/\./.test(text)) {
        return true;
      }
      filled.push(text);
      for (let i = 0; i < force.length; i++) {
        if (force[i] === text) {
          force.splice(i, 1);
        }
      }
      return false;
    }));

    const counter = { count: 0 };

    let result = StepResult.success;

    // sanity check
    if (unfilled.length) {
      result = Step({
        list: unfilled, 
        limit, 
        counter, 
        filled, 
        force,
        block,
        common,
      });
    }

    return { squares, count: counter.count, result };

  }

