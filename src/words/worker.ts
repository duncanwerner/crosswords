/// <reference lib="webworker" />
import type { Dictionary, LoadResult, Request, Response } from './protocol';
import { anagrams } from './anagrams';
import { regexSearch } from './regex';
import { suggest } from './suggest';
import { WordIndex } from './word-index';

/**
 * hosts the word index off the main thread. messages are handled in order,
 * but loading is async, so queries wait on the current load.
 */

let loaded: { dictionary: Dictionary; index: WordIndex } | undefined;
let ready: Promise<WordIndex> | undefined;

const load = async (url: string, dictionary: Dictionary) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load the ${dictionary} word list (${response.status}).`);
  const raw: string[] = await response.json();
  return new WordIndex(raw);
};

/** the loaded index, with this query's block list applied */
const index = async (blocked: string[]) => {
  if (!ready) throw new Error('No dictionary loaded.');
  const loadedIndex = await ready;
  loadedIndex.setBlocked(blocked);
  return loadedIndex;
};

const handle = async (msg: Request): Promise<unknown> => {
  switch (msg.type) {
    case 'load': {
      if (loaded?.dictionary !== msg.dictionary || !ready) {
        const dictionary = msg.dictionary;
        ready = load(msg.url, dictionary).then(index => {
          loaded = { dictionary, index };
          return index;
        });
        ready.catch(() => {
          ready = undefined;
          loaded = undefined;
        });
      }
      const index = await ready;
      index.setOptions(msg.options);
      return { dictionary: msg.dictionary, words: index.size } satisfies LoadResult;
    }
    case 'suggest':
      return suggest(await index(msg.blocked), msg);
    case 'anagrams':
      return anagrams(await index(msg.blocked), msg);
    case 'regex':
      return regexSearch(await index(msg.blocked), msg);
  }
};

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id } = e.data;
  let response: Response;
  try {
    response = { id, ok: true, result: await handle(e.data) };
  }
  catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
