import { For, Show, createEffect, createMemo, createSignal, useContext } from 'solid-js';
import { format, fromAnswer, parse, validate } from '../model/enumeration';
import { nextLight } from '../model/navigation';
import type { Direction, Light } from '../model/types';
import { EditorContext } from '../state/editor';
import styles from './CluePanel.module.css';

const focusClue = (light: Light | undefined) => {
  if (!light) return;
  document.querySelector<HTMLTextAreaElement>(`[data-clue="${light.key}"] textarea`)?.focus();
};

export const CluePanel = () => {
  const ed = useContext(EditorContext);
  const lights = (dir: Direction) => ed.map().lights.filter(l => l.dir === dir);
  const written = createMemo(() => ed.map().lights.filter(l => ed.puzzle.clues[l.key]?.text.trim()).length);

  // keep the active clue visible as the grid selection moves
  createEffect(
    () => ed.currentLight()?.key,
    key => {
      if (key) document.querySelector(`[data-clue="${key}"]`)?.scrollIntoView({ block: 'nearest' });
    },
  );

  return (
    <section class={styles.panel} aria-label="Clues">
      <div class={styles.head}>
        <h2>Clues</h2>
        <span class={styles.progress}>{written()} of {ed.map().lights.length} written</span>
      </div>
      <div class={styles.scroll}>
        <For each={['across', 'down'] as const}>
          {dir => (
            <div class={styles.section}>
              <h3>{dir}</h3>
              <For each={lights(dir)} keyed={l => l.key} fallback={<p class={styles.empty}>No {dir} lights.</p>}>
                {light => <ClueRow light={light()} />}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
};

const ClueRow = (props: { light: Light }) => {
  const ed = useContext(EditorContext);
  const [error, setError] = createSignal('');

  const entry = () => ed.puzzle.clues[props.light.key];
  const active = () => ed.currentLight()?.key === props.light.key;
  const letters = () => props.light.cells.map(i => ed.puzzle.cells[i].letter);
  const pattern = () => letters().map(l => l || '·').join('');
  const validity = () => validate(entry()?.enumeration ?? '', props.light.length);

  const activate = () => {
    if (ed.mode() !== 'fill') ed.setMode('fill');
    if (!active()) ed.selectLight(props.light);
  };

  const onTextKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      focusClue(nextLight(ed.map(), props.light, e.shiftKey ? -1 : 1));
    }
    else if (e.key === 'Escape') {
      e.preventDefault();
      ed.focusGrid();
    }
  };

  const tidyEnumeration = (value: string) => {
    const parsed = parse(value);
    if (parsed && format(parsed) !== value) ed.setClue(props.light.key, { enumeration: format(parsed) });
  };

  const applyAnswer = (input: HTMLInputElement) => {
    const { letters: answer, enumeration } = fromAnswer(input.value);
    if (!answer) return;
    if (answer.length !== props.light.length) {
      setError(`“${input.value.trim()}” has ${answer.length} letters; this light has ${props.light.length}.`);
      return;
    }
    setError('');
    ed.fillLight(props.light, answer, enumeration);
    input.value = '';
  };

  return (
    <div
      class={[styles.row, { [styles.active]: active() }]}
      data-clue={props.light.key}
      onFocusIn={activate}
    >
      <span class={styles.number}>{props.light.number}</span>
      <textarea
        class={styles.text}
        rows={1}
        value={entry()?.text ?? ''}
        placeholder="Write a clue…"
        aria-label={`${props.light.number} ${props.light.dir} clue`}
        onInput={e => ed.setClue(props.light.key, { text: e.currentTarget.value })}
        onKeyDown={onTextKey}
      />
      <label
        class={[styles.enum, { [styles.bad]: validity() === 'invalid' || validity() === 'mismatch' }]}
        title={
          validity() === 'mismatch' ? `Doesn't add up to ${props.light.length}`
            : validity() === 'invalid' ? 'Use numbers with commas or hyphens, e.g. 3,4 or 4-5'
            : 'Enumeration, e.g. 3,4 or 4-5'
        }
      >
        (
        <input
          value={entry()?.enumeration ?? ''}
          placeholder={String(props.light.length)}
          aria-label={`${props.light.number} ${props.light.dir} enumeration`}
          onInput={e => ed.setClue(props.light.key, { enumeration: e.currentTarget.value })}
          onBlur={e => tidyEnumeration(e.currentTarget.value)}
        />
        )
      </label>
      <div class={styles.answerLine}>
        <span class={[styles.pattern, { [styles.complete]: letters().every(Boolean) }]} aria-label="Current letters">
          {pattern()}
        </span>
        <input
          class={styles.answer}
          placeholder="Type an answer and press Enter to fill"
          aria-label={`${props.light.number} ${props.light.dir} answer`}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyAnswer(e.currentTarget);
            }
          }}
          onInput={() => setError('')}
        />
      </div>
      <Show when={error()}>
        <div class={styles.error} role="alert">{error()}</div>
      </Show>
    </div>
  );
};
