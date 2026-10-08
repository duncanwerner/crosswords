import type { AnagramRequest, AnagramResult } from './anagrams';
import type { FillResult } from './fill';
import type { Blocking, Dictionary, FillProgress, FillRequest, LoadResult, Request, Response, SuggestRequest, SuggestResult } from './protocol';
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
interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  progress?: (p: FillProgress) => void;
}

const pending = new Map<number, Pending>();

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
    if ('progress' in e.data) {
      entry.progress?.(e.data.progress);
      return;
    }
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

const call = <T>(body: Body, timeout?: number, progress?: (p: FillProgress) => void, onId?: (id: number) => void): Promise<T> => {
  if (body.type === 'load') lastLoad = body;
  worker ??= start();
  const id = ++nextId;
  onId?.(id);
  return new Promise<T>((resolve, reject) => {
    const entry: Pending = { resolve: resolve as (v: unknown) => void, reject, progress };
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
  suggest: (req: SuggestRequest & Blocking) => call<SuggestResult>({ type: 'suggest', ...req }, 10000),
  anagrams: (req: AnagramRequest & Blocking) => call<AnagramResult>({ type: 'anagrams', ...req }, 10000),
  regex: (req: RegexRequest & Blocking) => call<RegexResult>({ type: 'regex', ...req }, 4000),
  /** start a fill; the worker stops itself at req.timeMs. cancel() ends it early with the best result so far */
  fill: (req: FillRequest & Blocking, onProgress: (p: FillProgress) => void) => {
    let id = 0;
    const promise = call<FillResult>({ type: 'fill', ...req }, req.timeMs + 15000, onProgress, i => (id = i));
    return {
      promise,
      cancel: () => {
        if (id) void call<boolean>({ type: 'cancel', target: id }).catch(() => {});
      },
    };
  },
};
