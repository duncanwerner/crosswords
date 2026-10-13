import { For, Show, createMemo, createSignal } from 'solid-js';
import { type ImportResult, deletePuzzle, duplicatePuzzle, exportLibrary, exportPuzzle, importFile, library, loadPuzzle, markTemplate, newFromTemplate } from '../state/library';
import { openPuzzle, playPuzzle } from '../state/route';
import { LIBRARY_SORTS, type LibrarySort, sortSummaries } from '../state/storage';
import styles from './Library.module.css';
import { NewPuzzleDialog } from './NewPuzzleDialog';
import { Thumbnail } from './Thumbnail';

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

/** what a library restore did, in a sentence */
const restored = (r: Extract<ImportResult, { kind: 'library' }>) => {
  const nothing = !r.added && !r.clues && r.existing;
  const parts = [nothing ? 'Nothing new to restore:' : `Restored ${plural(r.added, 'puzzle')} and ${plural(r.clues, 'logged clue')}.`];
  if (r.existing) parts.push(`${plural(r.existing, 'puzzle')} already in your library ${r.existing === 1 ? 'was' : 'were'} left as is.`);
  if (r.clueError) parts.push(`The clue log couldn't be restored: ${r.clueError}`);
  if (r.unreadable) parts.push(`${plural(r.unreadable, 'entry', 'entries')} couldn't be read.`);
  if (r.failed) parts.push(`${plural(r.failed, 'puzzle')} didn't fit in browser storage.`);
  return parts.join(' ');
};

const ago = (time: number) => {
  const s = Math.round((Date.now() - time) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
};

const SORT_KEY = 'cross:library-sort';
const TEMPLATE_SORTS = LIBRARY_SORTS.filter(o => o.value !== 'complete' && o.value !== 'unfinished');

/** the sort for each section; a per-browser preference */
const readSorts = () => {
  const sorts: { puzzles: LibrarySort; templates: LibrarySort } = { puzzles: 'newest', templates: 'newest' };
  try {
    const raw = JSON.parse(localStorage.getItem(SORT_KEY) || '{}');
    if (LIBRARY_SORTS.some(o => o.value === raw.puzzles)) sorts.puzzles = raw.puzzles;
    if (TEMPLATE_SORTS.some(o => o.value === raw.templates)) sorts.templates = raw.templates;
  }
  catch {
    // defaults
  }
  return sorts;
};

const SortSelect = (props: { value: LibrarySort; options: typeof LIBRARY_SORTS; label: string; onChange: (sort: LibrarySort) => void }) => (
  <label class={styles.sort}>
    Sort
    <select class="field" aria-label={props.label} value={props.value} onChange={e => props.onChange(e.currentTarget.value as LibrarySort)}>
      <For each={props.options}>{o => <option value={o.value}>{o.label}</option>}</For>
    </select>
  </label>
);

export const Library = () => {
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');
  let fileInput!: HTMLInputElement;
  const [sorts, setSorts] = createSignal(readSorts());
  const setSort = (section: 'puzzles' | 'templates', sort: LibrarySort) => {
    const next = { ...sorts(), [section]: sort };
    setSorts(next);
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(next));
    }
    catch {
      // preference only
    }
  };
  const templates = createMemo(() => sortSummaries(library.puzzles.filter(s => s.template), sorts().templates));
  const puzzles = createMemo(() => sortSummaries(library.puzzles.filter(s => !s.template), sorts().puzzles));

  const onImport = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      setError('');
      setNotice('');
      const result = await importFile(file);
      if (result.kind === 'puzzle') openPuzzle(result.puzzle.id);
      else setNotice(restored(result));
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onBackup = async () => {
    setError('');
    setNotice('');
    setError(await exportLibrary());
  };

  const onDelete = (id: string, title: string) => {
    if (confirm(`Delete “${title}”? This can't be undone.`)) deletePuzzle(id);
  };

  const onNewFrom = (id: string) => {
    const p = newFromTemplate(id);
    if (p) openPuzzle(p.id);
  };

  const onExport = (id: string) => {
    const p = loadPuzzle(id);
    if (p) exportPuzzle(p);
  };

  return (
    <main class={styles.page}>
      <header class={styles.header}>
        <h1 class={styles.brand}>
          Cross
          <small>Cryptic crossword editor</small>
        </h1>
        <Show when={library.puzzles.length}>
          <button class="btn" onClick={onBackup} title="Download every puzzle, template and logged clue in one file">Back up library</button>
        </Show>
        <button class="btn" onClick={() => fileInput.click()} title="Open a puzzle file, or restore a library backup">Import…</button>
        <button class="btn primary" onClick={() => setCreating(true)}>New puzzle</button>
        <input ref={fileInput} type="file" accept="application/json,.json" class="visually-hidden" onChange={onImport} />
      </header>

      <Show when={error()}>
        <p class={styles.error} role="alert">{error()}</p>
      </Show>
      <Show when={notice()}>
        <p class={styles.notice} role="status">{notice()}</p>
      </Show>

      <Show
        when={library.puzzles.length}
        fallback={
          <div class={styles.empty}>
            <p>No puzzles yet.</p>
            <button class="btn primary" onClick={() => setCreating(true)}>Create your first grid</button>
          </div>
        }
      >
        <Show when={templates().length}>
          <div class={styles.sectionHead}>
            <h2 class={styles.section}>Templates</h2>
            <Show when={templates().length > 1}>
              <SortSelect value={sorts().templates} options={TEMPLATE_SORTS} label="Sort templates" onChange={sort => setSort('templates', sort)} />
            </Show>
          </div>
          <div class={styles.grid}>
            <For each={templates()} keyed={s => s.id}>
              {s => (
                <article class={[styles.card, styles.template]}>
                  <button class={styles.open} onClick={() => openPuzzle(s().id)} title="Edit this template">
                    <div class={styles.thumb}>
                      <Thumbnail rows={s().rows} cols={s().cols} thumb={s().thumb} />
                    </div>
                    <h2 class={styles.title}>{s().title || 'Untitled'}</h2>
                    <div class={styles.meta}>
                      {s().rows}×{s().cols} · {s().style}
                    </div>
                  </button>
                  <div class={styles.actions}>
                    <button class="btn ghost" onClick={() => onNewFrom(s().id)} title="A new puzzle with this grid">New puzzle</button>
                    <button class="btn ghost" onClick={() => markTemplate(s().id, false)} title="Move back to your puzzles">Unmark</button>
                    <button class="btn ghost" onClick={() => onExport(s().id)}>Export</button>
                    <button class="btn ghost danger" onClick={() => onDelete(s().id, s().title)}>Delete</button>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
        <Show when={templates().length || puzzles().length > 1}>
          <div class={styles.sectionHead}>
            <h2 class={styles.section}>Puzzles</h2>
            <Show when={puzzles().length > 1}>
              <SortSelect value={sorts().puzzles} options={LIBRARY_SORTS} label="Sort puzzles" onChange={sort => setSort('puzzles', sort)} />
            </Show>
          </div>
        </Show>
        <Show when={puzzles().length} fallback={<p class={styles.none}>No puzzles yet. Start one from a template, or with New puzzle.</p>}>
          <div class={styles.grid}>
            <For each={puzzles()} keyed={s => s.id}>
              {s => (
                <article class={styles.card}>
                  <button class={styles.open} onClick={() => openPuzzle(s().id)}>
                    <div class={styles.thumb}>
                      <Thumbnail rows={s().rows} cols={s().cols} thumb={s().thumb} />
                    </div>
                    <h2 class={styles.title}>{s().title || 'Untitled'}</h2>
                    <span
                      class={[styles.status, { [styles.complete]: s().complete }]}
                      title={s().complete ? 'Every square filled and every answer clued' : 'Some squares or clues still to do'}
                    >
                      {s().complete ? '✓ Complete' : 'Unfinished'}
                    </span>
                    <div class={styles.meta}>
                      {s().rows}×{s().cols} · {s().style} · {ago(s().updated)}
                    </div>
                  </button>
                  <div class={styles.actions}>
                    <button class="btn ghost" onClick={() => playPuzzle(s().id)} title="Solve this puzzle">Play</button>
                    <button class="btn ghost" onClick={() => duplicatePuzzle(s().id)}>Duplicate</button>
                    <button class="btn ghost" onClick={() => markTemplate(s().id, true)} title="Keep this grid for starting new puzzles">Make template</button>
                    <button class="btn ghost" onClick={() => onExport(s().id)}>Export</button>
                    <button class="btn ghost danger" onClick={() => onDelete(s().id, s().title)}>Delete</button>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={creating()}>
        <NewPuzzleDialog onClose={() => setCreating(false)} />
      </Show>
    </main>
  );
};
