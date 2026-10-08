import { For, createSignal, onSettled } from 'solid-js';
import { MAX_SIZE, MIN_SIZE, type Template, clampSize } from '../model/puzzle';
import type { GridStyle, Symmetry } from '../model/types';
import { createNewPuzzle } from '../state/library';
import { openPuzzle } from '../state/route';
import styles from './NewPuzzleDialog.module.css';

interface Choice<T> { value: T; label: string; hint: string }

const STYLES: Choice<GridStyle>[] = [
  { value: 'blocked', label: 'Blocked', hint: 'Black squares' },
  { value: 'barred', label: 'Barred', hint: 'Thick bars' },
];

const SYMMETRIES: Choice<Symmetry>[] = [
  { value: 'rotational', label: 'Rotational', hint: '180° symmetry' },
  { value: 'none', label: 'None', hint: 'Freeform' },
];

const TEMPLATES: Choice<Template>[] = [
  { value: 'lattice', label: 'Lattice', hint: 'Blocks on odd squares' },
  { value: 'empty', label: 'Empty', hint: 'All white' },
];

export const NewPuzzleDialog = (props: { onClose: () => void }) => {
  let dialog!: HTMLDialogElement;
  const [title, setTitle] = createSignal('');
  const [rows, setRows] = createSignal(15);
  const [cols, setCols] = createSignal(15);
  const [style, setStyle] = createSignal<GridStyle>('blocked');
  const [symmetry, setSymmetry] = createSignal<Symmetry>('rotational');
  const [template, setTemplate] = createSignal<Template>('lattice');

  onSettled(() => {
    dialog.showModal();
  });

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const p = createNewPuzzle({
      title: title().trim(),
      rows: clampSize(rows()),
      cols: clampSize(cols()),
      style: style(),
      symmetry: symmetry(),
      template: style() === 'blocked' ? template() : 'empty',
    });
    props.onClose();
    openPuzzle(p.id);
  };

  const radios = <T extends string>(name: string, legend: string, choices: Choice<T>[], value: () => T, set: (v: T) => void, disabled = () => false) => (
    <fieldset class={styles.choice}>
      <legend>{legend}</legend>
      <For each={choices}>
        {c => (
          <label class={styles.option}>
            <input type="radio" name={name} value={c.value} checked={value() === c.value} disabled={disabled()} onChange={() => set(c.value)} />
            <span>{c.label}</span>
            <small>{c.hint}</small>
          </label>
        )}
      </For>
    </fieldset>
  );

  return (
    <dialog ref={dialog} class={styles.dialog} onClose={() => props.onClose()}>
      <form class={styles.form} onSubmit={onSubmit}>
        <h2>New puzzle</h2>
        <label class={styles.label}>
          Title
          <input class="field" value={title()} placeholder="Untitled" onInput={e => setTitle(e.currentTarget.value)} />
        </label>
        <div class={styles.size}>
          <label class={styles.label}>
            Rows
            <input class="field" type="number" min={MIN_SIZE} max={MAX_SIZE} value={rows()} onInput={e => setRows(e.currentTarget.valueAsNumber)} />
          </label>
          <span class={styles.times}>×</span>
          <label class={styles.label}>
            Columns
            <input class="field" type="number" min={MIN_SIZE} max={MAX_SIZE} value={cols()} onInput={e => setCols(e.currentTarget.valueAsNumber)} />
          </label>
        </div>
        {radios('style', 'Grid style', STYLES, style, setStyle)}
        {radios('template', 'Start with', TEMPLATES, template, setTemplate, () => style() === 'barred')}
        {radios('symmetry', 'Symmetry', SYMMETRIES, symmetry, setSymmetry)}
        <div class={styles.buttons}>
          <button type="button" class="btn" onClick={() => dialog.close()}>Cancel</button>
          <button type="submit" class="btn primary">Create</button>
        </div>
      </form>
    </dialog>
  );
};
