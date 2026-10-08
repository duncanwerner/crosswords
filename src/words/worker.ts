/// <reference lib="webworker" />
import type { Blocking, Dictionary, FillProgress, FillRequest, LoadResult, Request, Response } from './protocol';
import { anagrams } from './anagrams';
import { Filler, type FillResult } from './fill';
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

/** fills in progress, by request id, so a cancel message can reach them */
const fills = new Map<number, { cancelled: boolean }>();

const SLICE_MS = 25;
const PROGRESS_MS = 150;

/**
 * run the filler in short slices, yielding between them so cancel (and
 * other queries) get through. stops when done, out of time, or cancelled.
 */
const fill = async (id: number, req: FillRequest & Blocking): Promise<FillResult> => {
  const filler = new Filler(await index(req.blocked), req);
  const control = { cancelled: false };
  fills.set(id, control);
  const start = performance.now();
  let lastProgress = start;
  try {
    for (;;) {
      const sliceEnd = performance.now() + SLICE_MS;
      let state: ReturnType<Filler['run']>;
      do state = filler.run(10);
      while (state === 'running' && performance.now() < sliceEnd);

      const now = performance.now();
      const ms = now - start;
      if (state !== 'running') return filler.result(state, ms);
      if (control.cancelled) return filler.result('cancelled', ms);
      if (ms >= req.timeMs) return filler.result('partial', ms);
      if (now - lastProgress >= PROGRESS_MS) {
        lastProgress = now;
        const progress: FillProgress = { filled: filler.bestFilled, total: filler.total, nodes: filler.nodes, restarts: filler.restarts, ms };
        self.postMessage({ id, progress } satisfies Response);
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  finally {
    fills.delete(id);
  }
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
    case 'fill':
      return fill(msg.id, msg);
    case 'cancel': {
      const control = fills.get(msg.target);
      if (control) control.cancelled = true;
      return !!control;
    }
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
