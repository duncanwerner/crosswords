import { For, Show, createEffect, createMemo, createSignal, flush, useContext } from 'solid-js';
import { format, fromAnswer, parse, validate } from '../model/enumeration';
import { checkLinks, formatRef, parseLinks } from '../model/links';
import { nextLight } from '../model/navigation';
import type { Direction, Light, LightKey } from '../model/types';
import { clueLog, saveClue, savedFrom } from '../state/clue-log';
import { EditorContext } from '../state/editor';
import styles from './CluePanel.module.css';

const focusClue = (light: Pick<Light, 'key'> | undefined) => {
  if (!light) return;
  document.querySelector<HTMLTextAreaElement>(`[data-clue="${light.key}"] textarea`)?.focus();
};

export const CluePanel = () => {
  const ed = useContext(EditorContext);
  const lights = (dir: Direction) => ed.map().lights.filter(l => l.dir === dir);
  const written = createMemo(() => ed.entries().list.filter(e => ed.puzzle.clues[e.key]?.text.trim()).length);

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
        <span class={styles.progress}>{written()} of {ed.entries().list.length} written</span>
      </div>
      <div class={styles.scroll}>
        <For each={['across', 'down'] as const}>
          {dir => (
            <div class={styles.section}>
              <h3>{dir}</h3>
              <For each={lights(dir)} keyed={l => l.key} fallback={<p class={styles.empty}>No {dir} lights.</p>}>
                {light => (
                  <Show when={ed.entries().byLight.get(light().key)?.key !== light().key} fallback={<ClueRow light={light()} />}>
                    <SeeRow light={light()} />
                  </Show>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
};

/** a light whose answer is part of a linked clue: points at the clue */
const SeeRow = (props: { light: Light }) => {
  const ed = useContext(EditorContext);
  const head = () => ed.entries().byLight.get(props.light.key)!.lights[0];
  const active = () => ed.currentLight()?.key === props.light.key;
  return (
    <div
      class={[styles.row, styles.see, { [styles.active]: active() }]}
      data-clue={props.light.key}
      onFocusIn={() => {
        if (ed.mode() !== 'fill') ed.setMode('fill');
        if (!active()) ed.selectLight(props.light);
      }}
    >
      <span class={styles.number}>{props.light.number}</span>
      <button class={styles.seeLink} onClick={() => focusClue(head())}>
        See {head().number}{head().dir !== props.light.dir ? ` ${head().dir}` : ''}
      </button>
    </div>
  );
};

const ClueRow = (props: { light: Light }) => {
  const ed = useContext(EditorContext);
  const [error, setError] = createSignal('');
  const [linking, setLinking] = createSignal(false);

  /** the whole answer: this light, plus any it links to */
  const answer = () => ed.entries().byLight.get(props.light.key) ?? { key: props.light.key, lights: [props.light], cells: props.light.cells, label: String(props.light.number) };
  const linked = () => answer().lights.length > 1;
  const length = () => answer().cells.length;
  const entry = () => ed.puzzle.clues[props.light.key];
  const active = () => ed.currentLight()?.key === props.light.key;
  const letters = () => answer().cells.map(i => ed.puzzle.cells[i].letter);
  const pattern = () => answer().lights.map(l => l.cells.map(i => ed.puzzle.cells[i].letter || '·').join('')).join('/');
  const validity = () => validate(entry()?.enumeration ?? '', length());
  const refs = () => answer().lights.slice(1).map(formatRef).join(', ');

  /**
   * hide the links field. removing a focused input makes the browser fire
   * blur in the middle of rendering, so that blur is ignored.
   */
  let closing = false;
  const closeLinks = (change?: () => void) => {
    closing = true;
    change?.();
    setLinking(false);
    flush();
    closing = false;
  };

  const applyLinks = (input: HTMLInputElement) => {
    if (closing) return;
    const parsed = parseLinks(input.value, ed.map(), props.light);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    const problem = checkLinks(props.light, parsed.keys, ed.entries());
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    const changed = parsed.keys.join() !== answer().lights.slice(1).map(l => l.key).join();
    if (!parsed.keys.length) {
      closeLinks(() => changed && ed.setLinks(props.light.key, []));
      return;
    }
    if (changed) ed.setLinks(props.light.key, parsed.keys);
    input.value = refs();
  };

  const unlink = () => {
    setError('');
    closeLinks(() => ed.setLinks(props.light.key, [] as LightKey[]));
  };

  // --- clue log ---
  /** the answer, once every square is filled */
  const word = () => (letters().every(Boolean) ? letters().join('') : '');
  const clueText = () => entry()?.text.trim() ?? '';
  const enumeration = () => (validity() === 'ok' ? entry()!.enumeration : '');
  const savedHere = () => (word() ? savedFrom(ed.puzzle.id, props.light.key, word()) : undefined);
  /** clues for this answer saved from anywhere else */
  const earlier = () => (clueLog().byWord.get(word()) ?? []).filter(r => r !== savedHere()).length;
  const logState = () => {
    if (!word() || !clueText()) return 'none';
    const saved = savedHere();
    if (!saved) return 'new';
    return saved.clue === clueText() && saved.enumeration === enumeration() ? 'saved' : 'changed';
  };

  const logClue = () => {
    saveClue({
      word: word(),
      enumeration: enumeration(),
      clue: clueText(),
      puzzleId: ed.puzzle.id,
      puzzleTitle: ed.puzzle.title,
      light: props.light.key,
    }).catch((err: Error) => setError(err.message));
  };

  const startLinking = (row: HTMLElement) => {
    setLinking(true);
    flush();
    row.querySelector<HTMLInputElement>('[data-links]')?.focus();
  };

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
    const { letters: typed, enumeration } = fromAnswer(input.value);
    if (!typed) return;
    if (typed.length !== length()) {
      setError(`“${input.value.trim()}” has ${typed.length} letters; ${linked() ? 'this answer' : 'this light'} has ${length()}.`);
      return;
    }
    setError('');
    ed.fillLight(answer(), typed, enumeration);
    input.value = '';
  };

  return (
    <div
      class={[styles.row, { [styles.active]: active() }]}
      data-clue={props.light.key}
      onFocusIn={activate}
    >
      <span class={styles.number}>{answer().label}</span>
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
          validity() === 'mismatch' ? `Doesn't add up to ${length()}`
            : validity() === 'invalid' ? 'Use numbers with commas or hyphens, e.g. 3,4 or 4-5'
            : 'Enumeration, e.g. 3,4 or 4-5'
        }
      >
        (
        <input
          value={entry()?.enumeration ?? ''}
          placeholder={String(length())}
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
          placeholder="Answer, then Enter to fill"
          aria-label={`${props.light.number} ${props.light.dir} answer`}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyAnswer(e.currentTarget);
            }
          }}
          onInput={() => setError('')}
        />
        <Show when={earlier()}>
          <button class={styles.earlier} title="Show them in the clue log" onClick={() => ed.showTool('log')}>
            Clued {earlier() === 1 ? 'once' : `${earlier()}×`} before
          </button>
        </Show>
        <Show when={logState() !== 'none'}>
          <button
            class={[styles.linkButton, { [styles.inLog]: logState() === 'saved' }]}
            disabled={logState() === 'saved'}
            title={logState() === 'saved' ? 'This clue is in your clue log' : logState() === 'changed' ? 'Replace the clue you saved for this answer earlier' : 'Save this clue to your clue log'}
            onClick={logClue}
          >
            {logState() === 'saved' ? '✓ Logged' : logState() === 'changed' ? 'Update log' : 'Save to log'}
          </button>
        </Show>
        <Show when={!linked() && !linking()}>
          <button
            class={styles.linkButton}
            title="Link this answer to more lights, for a clue like 1/5"
            onClick={e => startLinking(e.currentTarget.closest('[data-clue]')!)}
          >
            Link…
          </button>
        </Show>
      </div>
      <Show when={linked() || linking()}>
        <div class={styles.linkLine}>
          <label>
            Linked to
            <input
              data-links
              class={styles.links}
              value={refs()}
              placeholder="e.g. 5 or 12d"
              aria-label={`${props.light.number} ${props.light.dir} linked lights`}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLinks(e.currentTarget);
                }
                else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.currentTarget.value = refs();
                  setError('');
                  if (!linked()) closeLinks();
                }
              }}
              onBlur={e => applyLinks(e.currentTarget)}
              onInput={() => setError('')}
            />
          </label>
          <Show when={linked()}>
            <button class={styles.linkButton} title="Unlink: each light gets its own clue again" onClick={unlink}>Unlink</button>
          </Show>
        </div>
      </Show>
      <Show when={error()}>
        <div class={styles.error} role="alert">{error()}</div>
      </Show>
    </div>
  );
};
