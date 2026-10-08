import { For, Match, Show, Switch, createEffect, createMemo, createSignal, useContext } from 'solid-js';
import { EditorContext } from '../../state/editor';
import { status } from '../../state/words';
import { words } from '../../words/client';
import { type RegexResult, compile, parseLengths } from '../../words/regex';
import { FLAG_ABBREVIATION, FLAG_PROPER } from '../../words/word-index';
import { BlockButton, CopyStatus, DictionaryGate, type ToolProps, createCopier, latestOnly } from './common';
import styles from './tools.module.css';

const LIMIT = 1000;
const DEBOUNCE = 150;

// inputs persist across puzzles for the session
const [pattern, setPattern] = createSignal('');
const [lengthText, setLengthText] = createSignal('');

/** dictionary search by regular expression: case-insensitive, unanchored unless ^ / $ */
export const RegexTool = (props: ToolProps) => {
  const ed = useContext(EditorContext);
  const { copied, copy } = createCopier();
  const [result, setResult] = createSignal<{ key: string; result: RegexResult }>();
  const [error, setError] = createSignal('');

  const compiled = createMemo(() => {
    if (!pattern().trim()) return { ok: false as const, error: '' };
    try {
      compile(pattern());
      return { ok: true as const, error: '' };
    }
    catch (err) {
      return { ok: false as const, error: (err as Error).message.split(': ').pop() ?? 'Invalid pattern' };
    }
  });
  const lengths = createMemo(() => parseLengths(lengthText()));
  const key = () => `${pattern()}\u0000${lengthText()}`;

  const run = latestOnly();
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    () => ({ p: pattern(), c: compiled(), len: lengths(), k: key(), active: props.active, s: status(), blocked: ed.blocked() }),
    ({ p, c, len, k, active, s, blocked }) => {
      clearTimeout(timer);
      if (!active || !c.ok || !len || s.state !== 'ready') return;
      timer = setTimeout(() => {
        run(
          () => words.regex({ pattern: p, minLength: len.min, maxLength: len.max, limit: LIMIT, blocked }),
          r => {
            setError('');
            setResult({ key: k, result: r });
          },
          err => setError(err.message),
        );
      }, DEBOUNCE);
    },
  );

  /** results grouped by length */
  const groups = createMemo(() => {
    const r = result()?.result;
    if (!r) return [];
    const byLength = new Map<number, RegexResult['items']>();
    for (const item of r.items) {
      const list = byLength.get(item.word.length) ?? [];
      list.push(item);
      byLength.set(item.word.length, list);
    }
    return [...byLength.entries()].map(([length, items]) => ({ length, items }));
  });

  return (
    <div class={styles.tool}>
      <div class={styles.bar}>
        <input
          class={['field', styles.grow, styles.mono]}
          placeholder="Pattern, e.g. sten$"
          aria-label="Regular expression"
          spellcheck={false}
          autocapitalize="off"
          autocomplete="off"
          value={pattern()}
          onInput={e => setPattern(e.currentTarget.value)}
        />
        <label class={styles.label}>
          Length
          <input
            class={['field', styles.small]}
            placeholder="any"
            aria-label="Length filter"
            title="e.g. 7, 5-9 or 6+"
            value={lengthText()}
            onInput={e => setLengthText(e.currentTarget.value)}
          />
        </label>
      </div>
      <Show when={compiled().error}>
        <div class={styles.fieldError} role="alert">{compiled().error}</div>
      </Show>
      <Show when={!lengths()}>
        <div class={styles.fieldError} role="alert">Length should look like 7, 5-9 or 6+.</div>
      </Show>

      <DictionaryGate>
        <Switch>
          <Match when={error()}>
            <div class={[styles.message, styles.error]}>{error()}</div>
          </Match>
          <Match when={!pattern().trim()}>
            <div class={styles.help}>
              <p>
                Case doesn't matter. <code>^</code> start, <code>$</code> end, <code>.</code> any letter,{' '}
                <code>[aeiou]</code> one of, <code>(ab|cd)</code> either, <code>.{'{3}'}</code> three letters.
              </p>
              <p>
                Examples: <code>sten$</code> ends in STEN · <code>^re.*ed$</code> RE…ED · <code>^.a.e.$</code> ?A?E?
              </p>
            </div>
          </Match>
          <Match when={result()}>
            {r => (
              <Show when={r().result.total} fallback={<div class={styles.message}>No words match.</div>}>
                <div class={styles.info}>
                  <span>
                    {r().result.total.toLocaleString()} {r().result.total === 1 ? 'word' : 'words'}
                    <Show when={r().result.total > r().result.items.length}>
                      ; showing the shortest {r().result.items.length.toLocaleString()}
                    </Show>
                  </span>
                </div>
                <div class={[styles.results, { [styles.stale]: r().key !== key() }]}>
                  <For each={groups()} keyed={g => g.length}>
                    {g => (
                      <div class={styles.group}>
                        <h4>{g().length} letters <span>({g().items.length})</span></h4>
                        <div class={styles.chips}>
                          <For each={g().items}>
                            {item => (
                              <span class={styles.blockable}>
                                <button class={styles.chip} title="Copy" onClick={() => copy(item.word)}>
                                  {item.word}
                                  <Show when={item.flags & FLAG_PROPER}><span class={styles.tag}>proper</span></Show>
                                  <Show when={item.flags & FLAG_ABBREVIATION}><span class={styles.tag}>abbr.</span></Show>
                                </button>
                                <BlockButton word={item.word} onBlock={w => ed.blockWords([w])} />
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
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
