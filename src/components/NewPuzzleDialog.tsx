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

/** the last settings used to create a puzzle (everything but the title) */
interface Remembered {
  rows: number;
  cols: number;
  style: GridStyle;
  symmetry: Symmetry;
  template: Template;
}

const REMEMBER_KEY = 'cross:new-puzzle';
const DEFAULTS: Remembered = { rows: 15, cols: 15, style: 'blocked', symmetry: 'rotational', template: 'lattice' };

const pick = <T,>(value: unknown, choices: Choice<T>[], fallback: T) =>
  choices.some(c => c.value === value) ? (value as T) : fallback;

const recall = (): Remembered => {
  try {
    const raw = JSON.parse(localStorage.getItem(REMEMBER_KEY) || '{}');
    return {
      rows: Number.isFinite(raw.rows) ? clampSize(raw.rows) : DEFAULTS.rows,
      cols: Number.isFinite(raw.cols) ? clampSize(raw.cols) : DEFAULTS.cols,
      style: pick(raw.style, STYLES, DEFAULTS.style),
      symmetry: pick(raw.symmetry, SYMMETRIES, DEFAULTS.symmetry),
      template: pick(raw.template, TEMPLATES, DEFAULTS.template),
    };
  }
  catch {
    return DEFAULTS;
  }
};

const remember = (settings: Remembered) => {
  try {
    localStorage.setItem(REMEMBER_KEY, JSON.stringify(settings));
  }
  catch {
    // preference only
  }
};

export const NewPuzzleDialog = (props: { onClose: () => void }) => {
  let dialog!: HTMLDialogElement;
  const last = recall();
  const [title, setTitle] = createSignal('');
  const [rows, setRows] = createSignal(last.rows);
  const [cols, setCols] = createSignal(last.cols);
  const [style, setStyle] = createSignal<GridStyle>(last.style);
  const [symmetry, setSymmetry] = createSignal<Symmetry>(last.symmetry);
  const [template, setTemplate] = createSignal<Template>(last.template);

  onSettled(() => {
    dialog.showModal();
  });

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    const settings: Remembered = {
      rows: clampSize(rows()),
      cols: clampSize(cols()),
      style: style(),
      symmetry: symmetry(),
      template: template(),
    };
    remember(settings);
    const p = createNewPuzzle({
      ...settings,
      title: title().trim(),
      template: settings.style === 'blocked' ? settings.template : 'empty',
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
