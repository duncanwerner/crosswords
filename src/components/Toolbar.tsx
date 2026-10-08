import { Show, snapshot, useContext } from 'solid-js';
import type { Transform } from '../model/transform';
import type { Puzzle, Symmetry } from '../model/types';
import { EditorContext } from '../state/editor';
import { exportPuzzle } from '../state/library';
import { openLibrary } from '../state/route';
import styles from './Toolbar.module.css';

export const Toolbar = () => {
  const ed = useContext(EditorContext);

  const clear = () => {
    if (ed.filled() && confirm('Clear all letters from the grid?')) ed.clearLetters();
    ed.focusGrid();
  };

  const mode = (m: 'design' | 'fill') => {
    ed.setMode(m);
    ed.focusGrid();
  };

  const transform = (t: Transform) => {
    ed.transform(t);
    ed.focusGrid();
  };

  return (
    <header class={styles.bar}>
      <button class="btn ghost" onClick={openLibrary} title="Back to library">← Library</button>
      <div class={styles.titles}>
        <input
          class={styles.title}
          value={ed.puzzle.title}
          placeholder="Untitled"
          aria-label="Puzzle title"
          onInput={e => ed.setTitle(e.currentTarget.value)}
        />
        <input
          class={styles.setter}
          value={ed.puzzle.setter}
          placeholder="Setter"
          aria-label="Setter"
          onInput={e => ed.setSetter(e.currentTarget.value)}
        />
      </div>

      <div class={styles.segment} role="group" aria-label="Mode">
        <button aria-pressed={String(ed.mode() === 'design') as 'true' | 'false'} onClick={() => mode('design')}>Design</button>
        <button aria-pressed={String(ed.mode() === 'fill') as 'true' | 'false'} onClick={() => mode('fill')}>Fill</button>
      </div>

      <Show when={ed.mode() === 'design'}>
        <select
          class={['field', styles.select]}
          aria-label="Symmetry"
          value={ed.puzzle.symmetry}
          onChange={e => ed.setSymmetry(e.currentTarget.value as Symmetry)}
        >
          <option value="rotational">Rotational symmetry</option>
          <option value="none">No symmetry</option>
        </select>
        <div class={styles.group} role="group" aria-label="Transform grid">
          <button class="btn ghost" onClick={() => transform('rotate')} title="Rotate a quarter turn clockwise">Rotate</button>
          <button class="btn ghost" onClick={() => transform('flipH')} title="Mirror left to right">Flip ↔</button>
          <button class="btn ghost" onClick={() => transform('flipV')} title="Mirror top to bottom">Flip ↕</button>
        </div>
      </Show>

      <span class={styles.sep} />

      <div class={styles.group}>
        <button class="btn ghost" disabled={!ed.canUndo()} onClick={() => ed.undo()} title="Undo (Ctrl+Z)">Undo</button>
        <button class="btn ghost" disabled={!ed.canRedo()} onClick={() => ed.redo()} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button class="btn ghost" disabled={!ed.filled()} onClick={clear}>Clear letters</button>
        <button class="btn ghost" onClick={() => exportPuzzle(snapshot(ed.puzzle) as Puzzle)}>Export</button>
      </div>
    </header>
  );
};
