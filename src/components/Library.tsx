import { For, Show, createSignal } from 'solid-js';
import { deletePuzzle, duplicatePuzzle, exportPuzzle, importPuzzle, library, loadPuzzle } from '../state/library';
import { openPuzzle } from '../state/route';
import styles from './Library.module.css';
import { NewPuzzleDialog } from './NewPuzzleDialog';
import { Thumbnail } from './Thumbnail';

const ago = (time: number) => {
  const s = Math.round((Date.now() - time) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
};

export const Library = () => {
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal('');
  let fileInput!: HTMLInputElement;

  const onImport = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      setError('');
      const p = await importPuzzle(file);
      openPuzzle(p.id);
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDelete = (id: string, title: string) => {
    if (confirm(`Delete “${title}”? This can't be undone.`)) deletePuzzle(id);
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
        <button class="btn" onClick={() => fileInput.click()}>Import…</button>
        <button class="btn primary" onClick={() => setCreating(true)}>New puzzle</button>
        <input ref={fileInput} type="file" accept="application/json,.json" class="visually-hidden" onChange={onImport} />
      </header>

      <Show when={error()}>
        <p class={styles.error} role="alert">{error()}</p>
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
        <div class={styles.grid}>
          <For each={library.puzzles} keyed={s => s.id}>
            {s => (
              <article class={styles.card}>
                <button class={styles.open} onClick={() => openPuzzle(s().id)}>
                  <div class={styles.thumb}>
                    <Thumbnail rows={s().rows} cols={s().cols} thumb={s().thumb} />
                  </div>
                  <h2 class={styles.title}>{s().title || 'Untitled'}</h2>
                  <div class={styles.meta}>
                    {s().rows}×{s().cols} · {s().style} · {ago(s().updated)}
                  </div>
                </button>
                <div class={styles.actions}>
                  <button class="btn ghost" onClick={() => duplicatePuzzle(s().id)}>Duplicate</button>
                  <button class="btn ghost" onClick={() => onExport(s().id)}>Export</button>
                  <button class="btn ghost danger" onClick={() => onDelete(s().id, s().title)}>Delete</button>
                </div>
              </article>
            )}
          </For>
        </div>
      </Show>

      <Show when={creating()}>
        <NewPuzzleDialog onClose={() => setCreating(false)} />
      </Show>
    </main>
  );
};
