import { createSignal } from 'solid-js';
import { words } from '../words/client';
import { type CustomList, parseCustomList } from '../words/custom-list';
import type { Dictionary } from '../words/protocol';
import type { MineMode } from '../words/word-index';

/**
 * dictionary settings (a per-browser preference, not part of puzzles)
 * and load status. module-level, so shared by every editor.
 *
 * your own word list is kept for the browser session only (sessionStorage,
 * so it survives a reload but not a closed tab). it isn't saved with
 * puzzles or in backups: you have the file.
 */

export interface WordSettings {
  dictionary: Dictionary;
  proper: boolean;
  mine: MineMode;
}

export const DICTIONARIES: Array<{ value: Dictionary; label: string }> = [
  { value: 'base', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'insane', label: 'Huge' },
];

export const MINE_MODES: Array<{ value: MineMode; label: string; description: string }> = [
  { value: 'only', label: 'Only my words', description: 'Use only the words in your list' },
  { value: 'first', label: 'My words first', description: 'Offer your words ahead of dictionary words whenever they fit' },
  { value: 'mixed', label: 'My words mixed in', description: 'Add your words to the dictionary, with no preference' },
];

const KEY = 'cross:settings';
const LIST_KEY = 'cross:my-words';
const DEFAULTS: WordSettings = { dictionary: 'large', proper: false, mine: 'first' };

const read = (): WordSettings => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      dictionary: DICTIONARIES.some(d => d.value === raw.dictionary) ? raw.dictionary : DEFAULTS.dictionary,
      proper: typeof raw.proper === 'boolean' ? raw.proper : DEFAULTS.proper,
      mine: MINE_MODES.some(m => m.value === raw.mine) ? raw.mine : DEFAULTS.mine,
    };
  }
  catch {
    return DEFAULTS;
  }
};

const readList = (): CustomList | undefined => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(LIST_KEY) || 'null');
    if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.words)) return undefined;
    return {
      name: raw.name,
      words: raw.words.filter((w: unknown) => typeof w === 'string' && /^[A-Z]+$/.test(w)),
      enumerations: raw.enumerations && typeof raw.enumerations === 'object' ? raw.enumerations : {},
      skipped: +raw.skipped || 0,
      duplicates: +raw.duplicates || 0,
    };
  }
  catch {
    return undefined;
  }
};

export type WordStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; words: number; mine: number; version: number }
  | { state: 'error'; message: string };

const [settings, setSettingsSignal] = createSignal<WordSettings>(read());
const [status, setStatus] = createSignal<WordStatus>({ state: 'idle' });
/** true once any dictionary has loaded; tools keep showing results during a reload */
const [hasLoaded, setHasLoaded] = createSignal(false);
/** your own word list, if one is loaded */
const [myList, setMyListSignal] = createSignal<CustomList | undefined>(readList());

export { settings, status, hasLoaded, myList };

let loads = 0;
/**
 * your list as of the last change, with an id that changes with it so the
 * worker knows to rebuild. kept apart from the signal, which a load
 * straight after a change would still read as the old list.
 */
let mine: { id: number; list: CustomList | undefined } = { id: 0, list: myList() };

/** (re)load the index for the current settings; safe to call repeatedly */
export const loadWords = (next: WordSettings = settings()) => {
  const id = ++loads;
  setStatus({ state: 'loading' });
  const list = mine.list && { id: mine.id, words: mine.list.words };
  words.load(next.dictionary, { proper: next.proper, mine: next.mine }, list).then(
    result => {
      if (id !== loads) return;
      setStatus({ state: 'ready', words: result.words, mine: result.mine, version: id });
      setHasLoaded(true);
    },
    (err: Error) => {
      if (id === loads) setStatus({ state: 'error', message: err.message });
    },
  );
};

export const setWordSettings = (patch: Partial<WordSettings>) => {
  const next = { ...settings(), ...patch };
  setSettingsSignal(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  }
  catch {
    // preference only
  }
  loadWords(next);
};

const setMyList = (list: CustomList | undefined) => {
  mine = { id: mine.id + 1, list };
  setMyListSignal(list);
  try {
    if (list) sessionStorage.setItem(LIST_KEY, JSON.stringify(list));
    else sessionStorage.removeItem(LIST_KEY);
  }
  catch {
    // too big, or storage blocked: the list still works until a reload
  }
  loadWords();
};

/** read a text file of your own words (one per line) and use it; resolves to the list */
export const loadMyList = async (file: File) => {
  const list = parseCustomList(file.name, await file.text());
  if (!list.words.length) throw new Error(`${file.name} has no words in it.`);
  setMyList(list);
  return list;
};

export const clearMyList = () => setMyList(undefined);

/** the enumeration of one of your phrases (e.g. "3-2-3" for MANOFWAR), if it is one */
export const myEnumeration = (word: string): string | undefined => myList()?.enumerations[word];
