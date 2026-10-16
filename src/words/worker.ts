/// <reference lib="webworker" />
import type { Blocking, Dictionary, FillProgress, FillRequest, LoadResult, MineList, Request, Response } from './protocol';
import { anagrams } from './anagrams';
import { Filler, type FillResult } from './fill';
import { regexSearch } from './regex';
import { suggest } from './suggest';
import { WordIndex } from './word-index';

/**
 * hosts the word index off the main thread. messages are handled in order,
 * but loading is async, so queries wait on the current load. the index is
 * the dictionary plus your own words, rebuilt when either changes; the
 * dictionary's raw list is kept so a new list of yours doesn't refetch it.
 */

let loaded: { dictionary: Dictionary; mineId: number } | undefined;
let ready: Promise<WordIndex> | undefined;
let raw: { dictionary: Dictionary; words: Promise<string[]> } | undefined;

const fetchList = async (url: string, dictionary: Dictionary) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't load the ${dictionary} word list (${response.status}).`);
  return (await response.json()) as string[];
};

const load = async (url: string, dictionary: Dictionary, mine: MineList | undefined) => {
  if (raw?.dictionary !== dictionary) {
    const words = fetchList(url, dictionary);
    raw = { dictionary, words };
    words.catch(() => {
      if (raw?.words === words) raw = undefined;
    });
  }
  return new WordIndex(await raw.words, undefined, mine?.words);
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
      const mineId = msg.mine?.id ?? 0;
      if (loaded?.dictionary !== msg.dictionary || loaded.mineId !== mineId || !ready) {
        const dictionary = msg.dictionary;
        loaded = { dictionary, mineId };
        const pending = load(msg.url, dictionary, msg.mine);
        ready = pending;
        pending.catch(() => {
          if (ready !== pending) return;
          ready = undefined;
          loaded = undefined;
        });
      }
      const index = await ready;
      index.setOptions(msg.options);
      return { dictionary: msg.dictionary, words: index.size, mine: index.mineCount } satisfies LoadResult;
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
