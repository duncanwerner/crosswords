import { For, Match, Show, Switch, createEffect, createMemo, onSettled, untrack, useContext } from 'solid-js';
import { validate } from '../model/enumeration';
import type { Entry } from '../model/links';
import { playStatus, progressOf, puzzleForPlay } from '../model/play';
import type { Direction, Light, Puzzle } from '../model/types';
import { createEditor, EditorContext } from '../state/editor';
import { loadProgress, loadPuzzle, saveProgress } from '../state/library';
import { openLibrary, openPuzzle } from '../state/route';
import styles from './Play.module.css';
import editorStyles from './Editor.module.css';
import { GridView } from './GridView';

/**
 * play mode: the puzzle as a solver sees it. an empty grid to type into,
 * clues to read, and no tools. the solver's letters are saved apart from
 * the puzzle, so playing never changes it.
 */
export const Play = (props: { id: string }) => {
  const answers = loadPuzzle(untrack(() => props.id));

  return (
    <Show
      when={answers}
      fallback={
        <div class={editorStyles.missing}>
          <p>That puzzle doesn't exist (it may have been deleted).</p>
          <button class="btn" onClick={openLibrary}>Back to library</button>
        </div>
      }
    >
      {p => <PlayView answers={p()} />}
    </Show>
  );
};

const PlayView = (props: { answers: Puzzle }) => {
  const answers = untrack(() => props.answers);
  const ed = createEditor(puzzleForPlay(answers, loadProgress(answers.id)), {
    mode: 'fill',
    save: p => saveProgress(answers.id, progressOf(p)),
  });

  /** checked against the setter's letters on each grid change, not cell by cell */
  const status = createMemo(() => {
    ed.gridVersion();
    return untrack(() => playStatus(answers, ed.puzzle));
  });

  const edit = () => {
    ed.saveNow();
    openPuzzle(answers.id);
  };

  const clear = () => {
    if (ed.filled() && confirm('Clear all your letters and start again?')) ed.clearLetters();
    ed.focusGrid();
  };

  // undo/redo, as in the editor; play mode has no text fields to defer to
  onSettled(() => {
    ed.setMode('fill');
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
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
      <div class={editorStyles.page}>
        <header class={styles.bar}>
          <button class="btn ghost" onClick={openLibrary} title="Back to library">← Library</button>
          <h1 class={styles.title}>
            {answers.title || 'Untitled'}
            <Show when={answers.setter}><small>by {answers.setter}</small></Show>
          </h1>
          <Switch>
            <Match when={status() === 'solved'}><span class={[styles.status, styles.solved]}>✓ Solved</span></Match>
            <Match when={status() === 'wrong'}><span class={[styles.status, styles.wrong]}>All filled in, but not all right</span></Match>
            <Match when={status() === 'full'}><span class={styles.status}>All filled in</span></Match>
          </Switch>
          <div class={styles.group}>
            <button class="btn ghost" disabled={!ed.canUndo()} onClick={() => ed.undo()} title="Undo (Ctrl+Z)">Undo</button>
            <button class="btn ghost" disabled={!ed.canRedo()} onClick={() => ed.redo()} title="Redo (Ctrl+Shift+Z)">Redo</button>
            <button class="btn ghost" disabled={!ed.filled()} onClick={clear}>Clear</button>
            <button class="btn" onClick={edit} title="Open this puzzle in the editor">Edit</button>
          </div>
        </header>
        <div class={styles.main}>
          <div class={editorStyles.left}>
            <CurrentClue />
            <div class={editorStyles.gridBox} style={{ '--aspect': answers.cols / answers.rows }}>
              <GridView />
            </div>
            <p class={editorStyles.hint}>
              Type to fill · <kbd>Space</kbd> switch direction · <kbd>Tab</kbd> next light · arrows to move
            </p>
          </div>
          <PlayClues />
        </div>
      </div>
    </EditorContext>
  );
};

/** the answer a light belongs to, or the light on its own */
const entryFor = (light: Light, byLight: ReadonlyMap<string, Entry>): Entry =>
  byLight.get(light.key) ?? { key: light.key, lights: [light], cells: light.cells, label: String(light.number) };

/** the clue's enumeration if it's valid, else the answer length */
const enumerationFor = (puzzle: Puzzle, entry: Entry) => {
  const text = puzzle.clues[entry.key]?.enumeration ?? '';
  return validate(text, entry.cells.length) === 'ok' ? text : String(entry.cells.length);
};

/** the selected clue, above the grid */
const CurrentClue = () => {
  const ed = useContext(EditorContext);
  const entry = () => ed.currentEntry();
  return (
    <div class={styles.current} aria-live="polite">
      <Show when={entry()} fallback={<span class={styles.none}>Select a light to see its clue.</span>}>
        {e => (
          <>
            <strong>{e().label}{e().lights[0].dir === 'across' ? 'a' : 'd'}</strong>
            <span>
              {ed.puzzle.clues[e().key]?.text.trim() || <em class={styles.none}>No clue written</em>}
              {' '}({enumerationFor(ed.puzzle, e())})
            </span>
          </>
        )}
      </Show>
    </div>
  );
};

/** the clue list, read-only: choosing a clue selects its light in the grid */
const PlayClues = () => {
  const ed = useContext(EditorContext);
  const lights = (dir: Direction) => ed.map().lights.filter(l => l.dir === dir);

  /** answers whose squares are all filled; recounted per grid change */
  const answered = createMemo(() => {
    ed.gridVersion();
    return untrack(() => ed.entries().list.filter(e => e.cells.every(i => ed.puzzle.cells[i].letter)).length);
  });

  // keep the active clue visible as the grid selection moves
  createEffect(
    () => ed.currentEntry()?.key,
    key => {
      if (key) document.querySelector(`[data-play-clue="${key}"]`)?.scrollIntoView({ block: 'nearest' });
    },
  );

  const choose = (light: Light) => {
    ed.selectLight(light);
    ed.focusGrid();
  };

  return (
    <section class={styles.clues} aria-label="Clues">
      <div class={styles.head}>
        <h2>Clues</h2>
        <span>{answered()} of {ed.entries().list.length} answered</span>
      </div>
      <div class={styles.scroll}>
        <For each={['across', 'down'] as const}>
          {dir => (
            <div class={styles.section}>
              <h3>{dir}</h3>
              <For each={lights(dir)} keyed={l => l.key} fallback={<p class={styles.none}>No {dir} lights.</p>}>
                {light => {
                  const entry = () => entryFor(light(), ed.entries().byLight);
                  const head = () => entry().lights[0];
                  const done = () => entry().cells.every(i => ed.puzzle.cells[i].letter);
                  return (
                    <Show
                      when={head().key === light().key}
                      fallback={
                        <button
                          class={[styles.row, styles.see, { [styles.active]: ed.currentLight()?.key === light().key }]}
                          aria-label={`${light().number} ${dir}: see ${head().number} ${head().dir}`}
                          onClick={() => choose(light())}
                        >
                          <span class={styles.number}>{light().number}</span>
                          <span>See {head().number}{head().dir !== dir ? ` ${head().dir}` : ''}</span>
                        </button>
                      }
                    >
                      <button
                        class={[styles.row, { [styles.active]: ed.currentEntry()?.key === entry().key, [styles.done]: done() }]}
                        data-play-clue={entry().key}
                        aria-label={`${entry().label} ${dir}: ${ed.puzzle.clues[entry().key]?.text.trim() || 'no clue written'} (${enumerationFor(ed.puzzle, entry())})${done() ? ', answered' : ''}`}
                        onClick={() => choose(light())}
                      >
                        <span class={styles.number}>{entry().label}</span>
                        <span>
                          {ed.puzzle.clues[entry().key]?.text.trim() || <em class={styles.none}>No clue written</em>}
                          {' '}<span class={styles.enum}>({enumerationFor(ed.puzzle, entry())})</span>
                        </span>
                      </button>
                    </Show>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
};
