
//
// json dictionaries
// would be nice if there were a way we could lazy-load these
//
// actually you know what we should do? deltas.
//

import WordListInsane from '$lib/word-list-insane.json';
import WordListLarge from '$lib/word-list-large.json';
import WordListBase from '$lib/word-list-base.json';

export class WordList {

  protected sorted_list?: Map<string, string[]>;
  protected ordered_list?: string[][];
  protected common_list?: string[][];

  constructor(protected word_list: string[]) {}

  /**
   * get the list of sorted words for building anagrams.
   */
  public get sorted(): Map<string, string[]> {
    if (!this.sorted_list) {
      const list: Map<string, string[]> = new Map();
      for (const word of this.word_list) {
        const normal = word.toLocaleUpperCase();
        const letters = normal.split('').sort().join('');
        const set = list.get(letters) || [];
        if (!set.includes(normal)) {
          set.push(normal);
          list.set(letters, set);
        }
      }
      this.sorted_list = list;
    } 
    return this.sorted_list;
  }

  /**
   * get the word list, grouped by length
   */
  public get list(): string[][] {
    if (!this.ordered_list) {
      const list: string[][] = [];
      for (const word of this.word_list) {
        const len = word.length;
        if (!list[len]) {
          list[len] = [];
        }
        list[len].push(word);
      }
      this.ordered_list = list;
    }
    return this.ordered_list;
  }

  /**
   * this is a list of words excluding proper names. testing.
   */
  public get common(): string[][] {
    if (!this.common_list) {
      const list: string[][] = [];
      for (const word of this.word_list) {
        if (/^[A-Z]/.test(word)) {
          // console.info('common dropping', word);
          continue;
        }
        const len = word.length;
        if (!list[len]) {
          list[len] = [];
        }
        list[len].push(word);
      }
      this.common_list = list;
    }
    return this.common_list;
  }

  /**
   * return the raw list
   */
  public get raw(): string[] {
    return this.word_list;
  }

}

export const Base = new WordList(WordListBase);
export const Large = new WordList(WordListLarge);

// what the fuck is your problem with this
export const Insane = new WordList(WordListInsane);


