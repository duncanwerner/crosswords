import { Show, onSettled, untrack } from 'solid-js';
import { createEditor, EditorContext } from '../state/editor';
import { loadPuzzle } from '../state/library';
import { openLibrary } from '../state/route';
import { CluePanel } from './CluePanel';
import styles from './Editor.module.css';
import { GridView } from './GridView';
import { StatsPanel } from './StatsPanel';
import { Toolbar } from './Toolbar';

export const Editor = (props: { id: string }) => {
  const initial = loadPuzzle(untrack(() => props.id));

  return (
    <Show
      when={initial}
      fallback={
        <div class={styles.missing}>
          <p>That puzzle doesn't exist (it may have been deleted).</p>
          <button class="btn" onClick={openLibrary}>Back to library</button>
        </div>
      }
    >
      {p => <EditorView editor={createEditor(p())} />}
    </Show>
  );
};

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !el.hasAttribute('data-grid-input') &&
  (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.isContentEditable);

const EditorView = (props: { editor: ReturnType<typeof createEditor> }) => {
  const ed = untrack(() => props.editor);

  // undo/redo everywhere except text fields, which keep their native undo
  onSettled(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTextField(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        ed.undo();
      }
      else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        ed.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <EditorContext value={ed}>
      <div class={styles.page}>
        <Toolbar />
        <div class={styles.main}>
          <div class={styles.left}>
            <div class={styles.gridBox}>
              <GridView />
            </div>
            <p class={styles.hint}>
              <Show
                when={ed.mode() === 'design'}
                fallback={<>Type to fill · <kbd>Space</kbd> switch direction · <kbd>Tab</kbd> next light · arrows to move</>}
              >
                <Show
                  when={ed.puzzle.style === 'barred'}
                  fallback={<>Click a square or press <kbd>Space</kbd> to toggle a block · arrows to move</>}
                >
                  Click near an edge to toggle a bar · <kbd>Shift</kbd>+arrow toggles the bar on that side · <kbd>Space</kbd> toggles a block
                </Show>
              </Show>
            </p>
            <StatsPanel />
          </div>
          <div class={styles.right}>
            <CluePanel />
          </div>
        </div>
      </div>
    </EditorContext>
  );
};
