import type { AnagramRequest, AnagramResult } from './anagrams';
import type { Dictionary, LoadResult, Request, Response, SuggestRequest, SuggestResult } from './protocol';
import type { RegexRequest, RegexResult } from './regex';
import type { IndexOptions } from './word-index';

/**
 * promise wrapper around the word worker, created on first use. a request
 * that runs too long (a runaway regex, say) gets the worker killed and
 * replaced; the replacement reloads the last dictionary before anything else.
 */

type Body = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never;

let worker: Worker | undefined;
let nextId = 0;
let lastLoad: Body | undefined;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }>();

const rejectAll = (error: Error) => {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pending.clear();
};

const reset = (error: Error) => {
  worker?.terminate();
  worker = undefined;
  rejectAll(error);
};

const start = () => {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<Response>) => {
    const entry = pending.get(e.data.id);
    if (!entry) return;
    pending.delete(e.data.id);
    clearTimeout(entry.timer);
    if (e.data.ok) entry.resolve(e.data.result);
    else entry.reject(new Error(e.data.error));
  };
  w.onerror = e => reset(new Error(e.message || 'The word worker failed.'));
  // a replacement worker starts empty: restore the dictionary first
  if (lastLoad) w.postMessage({ ...lastLoad, id: -1 });
  return w;
};

const call = <T>(body: Body, timeout?: number): Promise<T> => {
  if (body.type === 'load') lastLoad = body;
  worker ??= start();
  const id = ++nextId;
  return new Promise<T>((resolve, reject) => {
    const entry: { resolve: (v: unknown) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> } = {
      resolve: resolve as (v: unknown) => void,
      reject,
    };
    if (timeout) {
      entry.timer = setTimeout(() => reset(new Error('That search took too long and was stopped.')), timeout);
    }
    pending.set(id, entry);
    worker!.postMessage({ ...body, id });
  });
};

const listUrl = (dictionary: Dictionary) =>
  new URL(`${import.meta.env.BASE_URL}wordlists/word-list-${dictionary}.json`, location.href).href;

export const words = {
  load: (dictionary: Dictionary, options: IndexOptions) =>
    call<LoadResult>({ type: 'load', url: listUrl(dictionary), dictionary, options }),
  suggest: (req: SuggestRequest) => call<SuggestResult>({ type: 'suggest', ...req }, 10000),
  anagrams: (req: AnagramRequest) => call<AnagramResult>({ type: 'anagrams', ...req }, 10000),
  regex: (req: RegexRequest) => call<RegexResult>({ type: 'regex', ...req }, 4000),
};
