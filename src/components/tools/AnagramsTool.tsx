import { For, Match, Show, Switch, createEffect, createMemo, createSignal, useContext } from 'solid-js';
import { toLetters } from '../../model/ascii';
import { EditorContext } from '../../state/editor';
import { status } from '../../state/words';
import type { AnagramResult } from '../../words/anagrams';
import { words } from '../../words/client';
import { BlockButton, CopyStatus, DictionaryGate, type ToolProps, createCopier, latestOnly } from './common';
import styles from './tools.module.css';

const LIMIT = 300;
const NUMBER_WORDS = ['', 'Single words', 'Two words', 'Three words', 'Four words'];

// options persist across puzzles for the session
const [maxWords, setMaxWords] = createSignal(3);
const [minLength, setMinLength] = createSignal(3);

/**
 * clue-writing helper: anagrams of the selected light's answer (once it's
 * complete), or of any letters typed in.
 */
export const AnagramsTool = (props: ToolProps) => {
  const ed = useContext(EditorContext);
  const { copied, copy } = createCopier();

  /** typed letters, tied to the light they were typed for */
  const [override, setOverride] = createSignal<{ key: string | undefined; text: string }>();
  const [result, setResult] = createSignal<AnagramResult>();
  const [error, setError] = createSignal('');

  /** the selected answer: a light, or linked lights read as one */
  const light = () => ed.currentEntry();
  const lightWord = createMemo(() => {
    const l = light();
    if (!l) return '';
    const letters = l.cells.map(i => ed.puzzle.cells[i].letter);
    return letters.every(Boolean) ? letters.join('') : '';
  });
  const overridden = () => {
    const o = override();
    return o && o.key === light()?.key ? o : undefined;
  };
  const text = () => overridden()?.text ?? lightWord();
  const letters = createMemo(() => toLetters(text()));

  const run = latestOnly();
  createEffect(
    () => ({ l: letters(), m: maxWords(), n: minLength(), active: props.active, s: status(), blocked: ed.blocked() }),
    ({ l, m, n, active, s, blocked }) => {
      if (!active || !l || s.state !== 'ready') return;
      run(
        () => words.anagrams({ letters: l, maxWords: m, minLength: n, limit: LIMIT, budgetMs: 2000, blocked }),
        r => {
          setError('');
          setResult(r);
        },
        err => setError(err.message),
      );
    },
  );

  const current = () => (result()?.letters === letters() ? result() : undefined);

  /** results grouped by number of words */
  const groups = createMemo(() => {
    const r = result();
    if (!r) return [];
    const byCount = new Map<number, string[][][]>();
    for (const item of r.items) {
      const list = byCount.get(item.parts.length) ?? [];
      list.push(item.parts);
      byCount.set(item.parts.length, list);
    }
    return [...byCount.entries()].sort((a, b) => a[0] - b[0]).map(([count, items]) => ({ count, items }));
  });

  const lightLabel = () => (light() ? `${light()!.label} ${light()!.lights[0].dir}` : '');

  return (
    <div class={styles.tool}>
      <div class={styles.bar}>
        <input
          class={['field', styles.grow, styles.mono, styles.upper]}
          placeholder="Letters to anagram"
          aria-label="Letters to anagram"
          value={text()}
          onInput={e => setOverride({ key: light()?.key, text: e.currentTarget.value })}
        />
        <label class={styles.label}>
          Up to
          <select class="field" aria-label="Maximum words" value={maxWords()} onChange={e => setMaxWords(+e.currentTarget.value)}>
            <For each={[1, 2, 3, 4]}>{n => <option value={n}>{n} word{n > 1 ? 's' : ''}</option>}</For>
          </select>
        </label>
        <label class={styles.label}>
          Min
          <select class="field" aria-label="Minimum word length" value={minLength()} onChange={e => setMinLength(+e.currentTarget.value)}>
            <For each={[2, 3, 4]}>{n => <option value={n}>{n} letters</option>}</For>
          </select>
        </label>
      </div>
      <div class={styles.info}>
        <Show when={letters()}>
          <span>{letters().length} letters</span>
        </Show>
        <Show when={overridden() && lightWord() && toLetters(overridden()!.text) !== lightWord()}>
          <button class={styles.link} onClick={() => setOverride(undefined)}>Use {lightLabel()} ({lightWord()})</button>
        </Show>
      </div>

      <DictionaryGate>
        <Switch>
          <Match when={error()}>
            <div class={[styles.message, styles.error]}>{error()}</div>
          </Match>
          <Match when={!letters()}>
            <div class={styles.message}>
              <Show
                when={light()}
                fallback={<p>Select a filled light, or type letters to anagram.</p>}
              >
                <p>{lightLabel()} isn't filled yet. Type letters to anagram anything.</p>
              </Show>
            </div>
          </Match>
          <Match when={result()}>
            {r => (
              <Show when={r().items.length} fallback={<div class={styles.message}>No anagrams of {r().letters}.</div>}>
                <div class={[styles.results, { [styles.stale]: !current() }]}>
                  <For each={groups()} keyed={g => g.count}>
                    {g => (
                      <div class={styles.group}>
                        <h4>{NUMBER_WORDS[g().count] ?? `${g().count} words`} <span>({g().items.length})</span></h4>
                        <Show
                          when={g().count === 1}
                          fallback={
                            <ul class={styles.rows}>
                              <For each={g().items}>
                                {parts => <Phrase parts={parts} onCopy={copy} onBlock={w => ed.blockWords([w])} />}
                              </For>
                            </ul>
                          }
                        >
                          <div class={styles.chips}>
                            <For each={g().items.flatMap(parts => parts[0])}>
                              {word => (
                                <span class={styles.blockable}>
                                  <button class={styles.chip} title="Copy" onClick={() => copy(word)}>{word}</button>
                                  <BlockButton word={word} onBlock={w => ed.blockWords([w])} />
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                  <Show when={r().truncated}>
                    <div class={styles.note}>Showing the first {r().items.length}. Allow fewer words or raise the minimum length to see others.</div>
                  </Show>
                </div>
              </Show>
            )}
          </Match>
        </Switch>
      </DictionaryGate>
      <CopyStatus copied={copied()} />
    </div>
  );
};

/**
 * a phrase: each part shows its first word, with same-letter alternatives
 * muted. hovering offers a ⊘ per word, since junk usually hides in phrases.
 */
const Phrase = (props: { parts: string[][]; onCopy: (text: string) => void; onBlock: (word: string) => void }) => {
  const phrase = () => props.parts.map(p => p[0]).join(' ');
  const distinct = () => [...new Set(props.parts.flat())];
  return (
    <li class={styles.phrase}>
      <button class={styles.row} title="Copy" onClick={() => props.onCopy(phrase())}>
        <For each={props.parts}>
          {(part, i) => (
            <>
              {i() > 0 ? ' ' : ''}
              {part[0]}
              <Show when={part.length > 1}>
                <span class={styles.alt}>/{part.slice(1).join('/')}</span>
              </Show>
            </>
          )}
        </For>
      </button>
      <span class={styles.blockers}>
        <For each={distinct()}>{word => <BlockButton word={word} onBlock={props.onBlock} label />}</For>
      </span>
    </li>
  );
};
