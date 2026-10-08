import { createSignal } from 'solid-js';
import { words } from '../words/client';
import type { Dictionary } from '../words/protocol';

/**
 * dictionary settings (a per-browser preference, not part of puzzles)
 * and load status. module-level, so shared by every editor.
 */

export interface WordSettings {
  dictionary: Dictionary;
  proper: boolean;
}

export const DICTIONARIES: Array<{ value: Dictionary; label: string }> = [
  { value: 'base', label: 'Standard' },
  { value: 'large', label: 'Large' },
  { value: 'insane', label: 'Huge' },
];

const KEY = 'cross:settings';
const DEFAULTS: WordSettings = { dictionary: 'large', proper: false };

const read = (): WordSettings => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      dictionary: DICTIONARIES.some(d => d.value === raw.dictionary) ? raw.dictionary : DEFAULTS.dictionary,
      proper: typeof raw.proper === 'boolean' ? raw.proper : DEFAULTS.proper,
    };
  }
  catch {
    return DEFAULTS;
  }
};

export type WordStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; words: number; version: number }
  | { state: 'error'; message: string };

const [settings, setSettingsSignal] = createSignal<WordSettings>(read());
const [status, setStatus] = createSignal<WordStatus>({ state: 'idle' });
/** true once any dictionary has loaded; tools keep showing results during a reload */
const [hasLoaded, setHasLoaded] = createSignal(false);

export { settings, status, hasLoaded };

let loads = 0;

/** (re)load the index for the current settings; safe to call repeatedly */
export const loadWords = (next: WordSettings = settings()) => {
  const id = ++loads;
  setStatus({ state: 'loading' });
  words.load(next.dictionary, { proper: next.proper }).then(
    result => {
      if (id !== loads) return;
      setStatus({ state: 'ready', words: result.words, version: id });
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
