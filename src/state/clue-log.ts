import { createSignal } from 'solid-js';
import { type ClueRecord, byNewest, sameSource, toRecord } from '../model/clue-log';
import { newId } from '../model/puzzle';

/**
 * the clue log, kept in IndexedDB (it grows across every puzzle, so it
 * stays out of localStorage). the whole log is held in memory once loaded;
 * every write goes to the database first. other tabs hear about changes
 * over a BroadcastChannel and reload.
 */

const DB = 'cross';
const STORE = 'clues';
const CHANNEL = 'cross:clue-log';

export type LogStatus = { state: 'idle' | 'loading' | 'ready' } | { state: 'error'; message: string };

interface LogState {
  list: ClueRecord[];
  /** word -> its records, newest first */
  byWord: Map<string, ClueRecord[]>;
}

const index = (records: ClueRecord[]): LogState => {
  const list = [...records].sort(byNewest);
  const byWord = new Map<string, ClueRecord[]>();
  for (const r of list) {
    const group = byWord.get(r.word);
    if (group) group.push(r);
    else byWord.set(r.word, [r]);
  }
  return { list, byWord };
};

const [log, setLog] = createSignal<LogState>(index([]));
const [status, setStatus] = createSignal<LogStatus>({ state: 'idle' });

export { log as clueLog, status as clueLogStatus };

// --- IndexedDB ---------------------------------------------------------

let db: Promise<IDBDatabase> | undefined;

const open = () => {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so the clue log is unavailable.'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('word', 'word');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the clue log.'));
    req.onblocked = () => reject(new Error('The clue log is busy in another tab; reload to try again.'));
  });
  db.catch(() => {
    db = undefined;
  });
  return db;
};

/** run one transaction; resolves when it commits */
const transact = async <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void) => {
  const tx = (await open()).transaction(STORE, mode);
  const req = fn(tx.objectStore(STORE));
  return new Promise<T | undefined>((resolve, reject) => {
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error('The clue log could not be saved.'));
    tx.onabort = () => reject(tx.error ?? new Error('The clue log could not be saved.'));
  });
};

// --- syncing between tabs ----------------------------------------------

const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);
channel?.addEventListener('message', () => void loadClueLog(true));
const announce = () => channel?.postMessage('changed');

// --- API ---------------------------------------------------------------

/** load the log (once, unless forced). safe to call from many places. */
export const loadClueLog = async (force = false) => {
  if (!force && status().state !== 'idle' && status().state !== 'error') return;
  if (!force) setStatus({ state: 'loading' });
  try {
    const raw = await transact<unknown[]>('readonly', s => s.getAll());
    setLog(index((raw ?? []).map(toRecord).filter((r): r is ClueRecord => !!r)));
    setStatus({ state: 'ready' });
  }
  catch (err) {
    setStatus({ state: 'error', message: (err as Error).message });
  }
};

export type SaveClue = Omit<ClueRecord, 'id' | 'saved'>;

/** save a clue; replaces this light's earlier save of the same answer in the same puzzle */
export const saveClue = async (input: SaveClue) => {
  const previous = log().list.find(r => sameSource(r, input));
  const record: ClueRecord = { ...input, clue: input.clue.trim(), id: previous?.id ?? newId(), saved: Date.now() };
  await transact('readwrite', s => s.put(record));
  setLog(index([record, ...log().list.filter(r => r.id !== record.id)]));
  announce();
};

export const deleteClue = async (id: string) => {
  await transact('readwrite', s => s.delete(id));
  setLog(index(log().list.filter(r => r.id !== id)));
  announce();
};

/** the record a save from this light would replace */
export const savedFrom = (puzzleId: string, light: ClueRecord['light'], word: string) =>
  log().byWord.get(word)?.find(r => sameSource(r, { puzzleId, light, word }));

export const exportClueLog = () => {
  const blob = new Blob([JSON.stringify({ clueLog: 1, records: log().list }, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clue-log.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** merge records from an exported file; returns how many were new */
export const importClueLog = async (file: File) => {
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  }
  catch {
    throw new Error('That file is not valid JSON.');
  }
  const list = (raw as { records?: unknown })?.records;
  if (!Array.isArray(list)) throw new Error("That file isn't a clue log export.");
  const known = new Set(log().list.map(r => r.id));
  const fresh = list.map(toRecord).filter((r): r is ClueRecord => !!r && !known.has(r.id));
  if (fresh.length) {
    await transact('readwrite', s => {
      for (const r of fresh) s.put(r);
    });
    setLog(index([...fresh, ...log().list]));
    announce();
  }
  return fresh.length;
};
